import {
  Definitions,
  IExecutionContextFacade,
  IModelParser,
  IProcessDefinitionRepository,
  IProcessModelService,
  Model,
  Runtime,
} from '@process-engine/process_engine_contracts';

import {IIAMService, IIdentity} from '@essential-projects/iam_contracts';

import {ForbiddenError, NotFoundError, UnprocessableEntityError} from '@essential-projects/errors_ts';

import * as BluebirdPromise from 'bluebird';
import * as clone from 'clone';

export class ProcessModelService implements IProcessModelService {

  private _processDefinitionRepository: IProcessDefinitionRepository;
  private _iamService: IIAMService;
  private _bpmnModelParser: IModelParser = undefined;

  private _canReadProcessModelClaim: string = 'can_read_process_model';
  private _canWriteProcessModelClaim: string = 'can_write_process_model';

  constructor(processDefinitionRepository: IProcessDefinitionRepository,
              iamService: IIAMService,
              bpmnModelParser: IModelParser) {

    this._processDefinitionRepository = processDefinitionRepository;
    this._iamService = iamService;
    this._bpmnModelParser = bpmnModelParser;
  }

  private get processDefinitionRepository(): IProcessDefinitionRepository {
    return this._processDefinitionRepository;
  }

  private get iamService(): IIAMService {
    return this._iamService;
  }

  private get bpmnModelParser(): IModelParser {
    return this._bpmnModelParser;
  }

  public async persistProcessDefinitions(executionContextFacade: IExecutionContextFacade,
                                         name: string,
                                         xml: string,
                                         overwriteExisting: boolean = true,
                                       ): Promise<void> {

    const identity: IIdentity = executionContextFacade.getIdentity();
    await this.iamService.ensureHasClaim(identity, this._canWriteProcessModelClaim);
    await this._validateDefinition(name, xml);

    return this.processDefinitionRepository.persistProcessDefinitions(name, xml, overwriteExisting);
  }

  public async getProcessModels(executionContextFacade: IExecutionContextFacade): Promise<Array<Model.Types.Process>> {

    const identity: IIdentity = executionContextFacade.getIdentity();
    await this.iamService.ensureHasClaim(identity, this._canReadProcessModelClaim);

    const processModelList: Array<Model.Types.Process> = await this._getProcessModelList();

    const filteredList: Array<Model.Types.Process> = [];

    for (const processModel of processModelList) {
      const filteredProcessModel: Model.Types.Process =
        await this._filterInaccessibleProcessModelElements(identity, processModel);

      if (filteredProcessModel) {
        filteredList.push(filteredProcessModel);
      }
    }

    return filteredList;
  }

  public async getProcessModelById(executionContextFacade: IExecutionContextFacade, processModelId: string): Promise<Model.Types.Process> {

    const identity: IIdentity = executionContextFacade.getIdentity();
    await this.iamService.ensureHasClaim(identity, this._canReadProcessModelClaim);

    const processModel: Model.Types.Process = await this._getProcessModelById(processModelId);

    const filteredProcessModel: Model.Types.Process = await this._filterInaccessibleProcessModelElements(identity, processModel);

    if (!filteredProcessModel) {
      throw new ForbiddenError('Access denied.');
    }

    return filteredProcessModel;
  }

  public async getProcessDefinitionAsXmlByName(executionContextFacade: IExecutionContextFacade, name: string): Promise<Runtime.Types.ProcessDefinitionFromRepository> {

    const identity: IIdentity = executionContextFacade.getIdentity();
    await this.iamService.ensureHasClaim(identity, this._canReadProcessModelClaim);

    const definitionRaw: Runtime.Types.ProcessDefinitionFromRepository = await this.processDefinitionRepository.getProcessDefinitionByName(name);

    if (!definitionRaw) {
      throw new NotFoundError(`Process definition with name "${name}" not found!`);
    }

    return definitionRaw;
  }

  /**
   * Takes the xml code of a given ProcessDefinition and tries to parse it.
   * If the parsing is successful, the xml is assumed to be valid.
   * Otherwise an error is thrown.
   *
   * @param name The name of the ProcessDefinition to validate.
   * @param xml  The xml code of the ProcessDefinition to validate.
   */
  private async _validateDefinition(name: string, xml: string): Promise<void> {
    try {
      await this.bpmnModelParser.parseXmlToObjectModel(xml);
    } catch (error) {
      throw new UnprocessableEntityError(`The XML for process "${name}" could not be parsed.`);
    }
  }

  /**
   * Retrieves a ProcessModel by its ID.
   * This is achieved by first retrieving a list of ProcessDefinitions and then
   * looking for the process that has the matching ID.
   *
   * @param   processModelId The ID of the ProcessModel to retrieve.
   * @returns                The retrieved ProcessModel.
   */
  private async _getProcessModelById(processModelId: string): Promise<Model.Types.Process> {

    const processModelList: Array<Model.Types.Process> = await this._getProcessModelList();

    const matchingProcessModel: Model.Types.Process = processModelList.find((processModel: Model.Types.Process): boolean => {
      return processModel.id === processModelId;
    });

    if (!matchingProcessModel) {
      throw new NotFoundError(`ProcessModel with id ${processModelId} not found!`);
    }

    return matchingProcessModel;
  }

  /**
   * Retrieves a list of all stored ProcessModels.
   * This is achieved by first retrieving all stored Definitions and then
   * taking all processes belonging to each definition.
   *
   * @returns The retrieved ProcessModels.
   */
  private async _getProcessModelList(): Promise<Array<Model.Types.Process>> {

    const definitions: Array<Definitions> = await this._getDefinitionList();

    const allProcessModels: Array<Model.Types.Process> = [];

    for (const definition of definitions) {
      Array.prototype.push.apply(allProcessModels, definition.processes);
    }

    return allProcessModels;
  }

  /**
   * Retrieves a list of all stored ProcessDefinitions.
   *
   * @returns The retrieved ProcessDefinitions.
   */
  private async _getDefinitionList(): Promise<Array<Definitions>> {

    const definitionsRaw: Array<Runtime.Types.ProcessDefinitionFromRepository> = await this.processDefinitionRepository.getProcessDefinitions();

    const definitionsMapper: any = async(rawProcessModelData: Runtime.Types.ProcessDefinitionFromRepository): Promise<Definitions> => {
      return this.bpmnModelParser.parseXmlToObjectModel(rawProcessModelData.xml);
    };

    const definitionsList: Array<Definitions> =
      await BluebirdPromise.map<Runtime.Types.ProcessDefinitionFromRepository, Definitions>(definitionsRaw, definitionsMapper);

    return definitionsList;
  }


  /**
   * Performs claim checks for each Element of the given ProcessModel.
   * If the user does not have access to a Element, that Element is filtered out
   * from the ProcessModel.
   *
   * These Elements include both, Lanes and FlowNodes.
   *
   * @param   identity       Contains the Users auth identity.
   * @param   processModelId The ID of the ProcessModel to filter.
   * @returns                The filtered ProcessModel.
   */
  private async _filterInaccessibleProcessModelElements(identity: IIdentity,
                                                        processModel: Model.Types.Process,
                                                       ): Promise<Model.Types.Process> {

    const processModelCopy: Model.Types.Process = clone(processModel);

    if (!processModel.laneSet) {
      return processModelCopy;
    }

    processModelCopy.laneSet = await this._filterOutInaccessibleLanes(processModelCopy.laneSet, identity);
    processModelCopy.flowNodes = this._getFlowNodesForLaneSet(processModelCopy.laneSet, processModel.flowNodes);

    const processModelHasAccessibleStartEvent: boolean = this._checkIfProcessModelHasAccessibleStartEvents(processModelCopy);

    if (!processModelHasAccessibleStartEvent) {
      return undefined;
    }

    return processModelCopy;
  }

  /**
   * Performs claim checks for each Lane of the given LaneSet.
   * If the user does not have access to a Lane, that Element is filtered out
   * from the LaneSet.
   *
   * @param   identity       Contains the Users auth identity.
   * @param   processModelId The ID of the ProcessModel to filter.
   * @returns                The filtered ProcessModel.
   */
  private async _filterOutInaccessibleLanes(laneSet: Model.Types.LaneSet, identity: IIdentity): Promise<Model.Types.LaneSet> {

    const filteredLaneSet: Model.Types.LaneSet = clone(laneSet);
    filteredLaneSet.lanes = [];

    for (const lane of laneSet.lanes) {

      const userCanAccessLane: boolean = await this._checkIfUserCanAccesslane(identity, lane.name);

      if (!userCanAccessLane) {
        continue;
      }

      const filteredLane: Model.Types.Lane = clone(lane);

      if (filteredLane.childLaneSet) {
        filteredLane.childLaneSet = await this._filterOutInaccessibleLanes(filteredLane.childLaneSet, identity);
      }

      filteredLaneSet.lanes.push(filteredLane);
    }

    return filteredLaneSet;
  }

  /**
   * Uses the IAM Service to perform a claim check for the given user and the
   * given Lane.
   *
   * @param   identity Contains the Users identity.
   * @param   laneName The name of the Lane for which to perform claim check.
   * @returns          A Promise, which returns "true", if the user does have
   *                   the claim, or "false", if he does not.
   */
  private async _checkIfUserCanAccesslane(identity: IIdentity, laneName: string): Promise<boolean> {
    try {
      await this.iamService.ensureHasClaim(identity, laneName);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets a list of FlowNodes that belong to the given LaneSet.
   *
   * @param   laneSet   The LaneSet for which to get the FlowNodes.
   * @param   flowNodes A list of FlowNodes from which to look for matches.
   * @returns           A list of FlowNodes, which belong to the given LaneSet.
   */
  private _getFlowNodesForLaneSet(laneSet: Model.Types.LaneSet, flowNodes: Array<Model.Base.FlowNode>): Array<Model.Base.FlowNode> {

    const accessibleFlowNodes: Array<Model.Base.FlowNode> = [];

    for (const lane of laneSet.lanes) {

      // NOTE: flowNodeReferences are stored in both, the parent lane AND in the child lane!
      // So if we have a lane A with two Sublanes B and C, we must not evaluate the elements from lane A!
      // Consider a user who can only access sublane B.
      // If we were to allow him access to all references stored in lane A, he would also be granted access to the elements
      // from lane C, since they are contained within the reference set of lane A!
      if (lane.childLaneSet) {
        const accessibleChildLaneFlowNodes: Array<Model.Base.FlowNode> =
          this._getFlowNodesForLaneSet(lane.childLaneSet, flowNodes);

        accessibleFlowNodes.push(...accessibleChildLaneFlowNodes);
      } else {
        for (const flowNodeId of lane.flowNodeReferences) {
          const matchingFlowNode: Model.Base.FlowNode = flowNodes.find((flowNode: Model.Base.FlowNode): boolean => {
            return flowNode.id === flowNodeId;
          });

          if (matchingFlowNode) {
            accessibleFlowNodes.push(matchingFlowNode);
          }
        }
      }
    }

    return accessibleFlowNodes;
  }

  /**
   * Checks if the given ProcessModel contains at least one accessible StartEvent.
   *
   * @param   processModel The ProcessModel to check.
   * @returns              True, if at least one acccessible StartEvent exists,
   *                       otherwise false.
   */
  private _checkIfProcessModelHasAccessibleStartEvents(processModel: Model.Types.Process): boolean {

    // For this check to pass, it is sufficient for the ProcessModel to have at least one accessible start event.
    const processModelHasAccessibleStartEvent: boolean = processModel.flowNodes.some((flowNode: Model.Base.FlowNode): boolean => {
      return flowNode instanceof Model.Events.StartEvent;
    });

    return processModelHasAccessibleStartEvent;
  }
}
