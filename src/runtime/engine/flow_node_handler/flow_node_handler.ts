import {IIdentity} from '@essential-projects/iam_contracts';

import {ILoggingApi, LogLevel} from '@process-engine/logging_api_contracts';
import {IMetricsApi} from '@process-engine/metrics_api_contracts';
import {
  IFlowNodeHandler,
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessTokenFacade,
  Model,
  NextFlowNodeInfo,
  Runtime,
} from '@process-engine/process_engine_contracts';

import * as moment from 'moment';
import * as uuid from 'uuid';

export abstract class FlowNodeHandler<TFlowNode extends Model.Base.FlowNode> implements IFlowNodeHandler<TFlowNode> {

  protected flowNodeInstanceId: string;

  private _flowNodeInstanceService: IFlowNodeInstanceService;
  private _loggingApiService: ILoggingApi;
  private _metricsApiService: IMetricsApi;

  constructor(flowNodeInstanceService: IFlowNodeInstanceService, loggingApiService: ILoggingApi, metricsApiService: IMetricsApi) {
    this._flowNodeInstanceService = flowNodeInstanceService;
    this._loggingApiService = loggingApiService;
    this._metricsApiService = metricsApiService;
  }

  protected get flowNodeInstanceService(): IFlowNodeInstanceService {
    return this._flowNodeInstanceService;
  }

  protected get loggingApiService(): ILoggingApi {
    return this._loggingApiService;
  }

  protected get metricsApiService(): IMetricsApi {
    return this._metricsApiService;
  }

  public async execute(flowNode: TFlowNode,
                       token: Runtime.Types.ProcessToken,
                       processTokenFacade: IProcessTokenFacade,
                       processModelFacade: IProcessModelFacade,
                       identity: IIdentity): Promise<NextFlowNodeInfo> {

    let nextFlowNode: NextFlowNodeInfo;
    this.flowNodeInstanceId = this.createFlowNodeInstanceId();

    try {
      nextFlowNode = await this.executeInternally(flowNode, token, processTokenFacade, processModelFacade, identity);

    } catch (error) {
      // TODO: (SM) this is only to support the old implementation
      //            I would like to set no token result or further specify it to be an error to avoid confusion
      await processTokenFacade.addResultForFlowNode(flowNode.id, error);

      throw error;
    }

    if (!nextFlowNode) {
      throw new Error(`Next flow node after node with id "${flowNode.id}" could not be found.`);
    }

    await this.afterExecute(flowNode, nextFlowNode.flowNode, nextFlowNode.processTokenFacade, processModelFacade);

    return nextFlowNode;
  }

  /**
   * Gets the instance ID of the FlowNode that this handler is responsible for.
   *
   * @returns The instance ID of the FlowNode.
   */
  public getInstanceId(): string {
    return this.flowNodeInstanceId;
  }

  /**
   * This is the method where the derived handlers must implement their logic.
   *
   * Here, the actual execution of the FlowNodes takes place.
   *
   * @async
   * @param flowNode               The FlowNode to execute.
   * @param token                  The current ProcessToken.
   * @param processTokenFacade     The ProcessTokenFacade of the curently
   *                               running process.
   * @param processModelFacade     The ProcessModelFacade of the curently
   *                               running process.
   * @param executionContextFacade Contains the requesting users identity.
   */
  protected async abstract executeInternally(flowNode: TFlowNode,
                                             token: Runtime.Types.ProcessToken,
                                             processTokenFacade: IProcessTokenFacade,
                                             processModelFacade: IProcessModelFacade,
                                             identity: IIdentity): Promise<NextFlowNodeInfo>;

  /**
   * Creates an instance ID for the FlowNode that this handler is responsible for.
   *
   * @returns The created FlowNodeInstanceId.
   */
  protected createFlowNodeInstanceId(): string {
    return uuid.v4();
  }

  /**
   * Persists the current state of the FlowNodeInstance, after it successfully started execution.
   *
   * @async
   * @param flowNodeInstance The FlowNodeInstance to persist.
   * @param processToken     The current ProcessToken of the FlowNodeInstance.
   */
  protected async persistOnEnter(flowNodeInstance: TFlowNode, processToken: Runtime.Types.ProcessToken): Promise<void> {

    await this.flowNodeInstanceService.persistOnEnter(flowNodeInstance.id, this.flowNodeInstanceId, processToken);

    const now: moment.Moment = moment.utc();

    this.metricsApiService.writeOnFlowNodeInstanceEnter(processToken.correlationId,
                                                     processToken.processModelId,
                                                     this.flowNodeInstanceId,
                                                     flowNodeInstance.id,
                                                     processToken,
                                                     now);

    this.loggingApiService.writeLogForFlowNode(processToken.correlationId,
                                               processToken.processModelId,
                                               processToken.processInstanceId,
                                               this.flowNodeInstanceId,
                                               flowNodeInstance.id,
                                               LogLevel.info,
                                               'Flow Node execution started.');
  }

  /**
   * Persists the current state of the FlowNodeInstance, after it successfully finished execution.
   *
   * @async
   * @param flowNodeInstance The FlowNodeInstance to persist.
   * @param processToken     The current ProcessToken of the FlowNodeInstance.
   */
  protected async persistOnExit(flowNodeInstance: TFlowNode, processToken: Runtime.Types.ProcessToken): Promise<void> {

    await this.flowNodeInstanceService.persistOnExit(flowNodeInstance.id, this.flowNodeInstanceId, processToken);

    const now: moment.Moment = moment.utc();

    this.metricsApiService.writeOnFlowNodeInstanceExit(processToken.correlationId,
                                                    processToken.processModelId,
                                                    this.flowNodeInstanceId,
                                                    flowNodeInstance.id,
                                                    processToken,
                                                    now);

    this.loggingApiService.writeLogForFlowNode(processToken.correlationId,
                                               processToken.processModelId,
                                               processToken.processInstanceId,
                                               this.flowNodeInstanceId,
                                               flowNodeInstance.id,
                                               LogLevel.info,
                                               'Flow Node execution finished.');
  }

  /**
   * Persists the current state of the FlowNodeInstance, after it was aborted, due to process termination.
   *
   * @async
   * @param flowNodeInstance The FlowNodeInstance to persist.
   * @param processToken     The current ProcessToken of the FlowNodeInstance.
   */
  protected async persistOnTerminate(flowNodeInstance: TFlowNode, processToken: Runtime.Types.ProcessToken): Promise<void> {

    await this.flowNodeInstanceService.persistOnTerminate(flowNodeInstance.id, this.flowNodeInstanceId, processToken);

    const now: moment.Moment = moment.utc();

    this.metricsApiService.writeOnFlowNodeInstanceExit(processToken.correlationId,
                                                    processToken.processModelId,
                                                    this.flowNodeInstanceId,
                                                    flowNodeInstance.id,
                                                    processToken,
                                                    now);

    this.loggingApiService.writeLogForFlowNode(processToken.correlationId,
                                               processToken.processModelId,
                                               processToken.processInstanceId,
                                               this.flowNodeInstanceId,
                                               flowNodeInstance.id,
                                               LogLevel.error,
                                               'Flow Node execution terminated.');
  }

  /**
   * Persists the current state of the FlowNodeInstance, after it encountered an error.
   *
   * @async
   * @param flowNodeInstance The FlowNodeInstance to persist.
   * @param processToken     The current ProcessToken of the FlowNodeInstance.
   */
  protected async persistOnError(flowNodeInstance: TFlowNode, processToken: Runtime.Types.ProcessToken, error: Error): Promise<void> {

    await this.flowNodeInstanceService.persistOnError(flowNodeInstance.id, this.flowNodeInstanceId, processToken, error);

    const now: moment.Moment = moment.utc();

    this.metricsApiService.writeOnFlowNodeInstanceError(processToken.correlationId,
                                                     processToken.processModelId,
                                                     this.flowNodeInstanceId,
                                                     flowNodeInstance.id,
                                                     processToken,
                                                     error,
                                                     now);

    this.loggingApiService.writeLogForFlowNode(processToken.correlationId,
                                               processToken.processModelId,
                                               processToken.processInstanceId,
                                               this.flowNodeInstanceId,
                                               flowNodeInstance.id,
                                               LogLevel.error,
                                              `Flow Node execution failed: ${error.message}`);
  }

  /**
   * Suspends the execution of the given FlowNodeInstance.
   *
   * @async
   * @param flowNodeInstance The FlowNodeInstance to suspend.
   * @param processToken     The current ProcessToken of the FlowNodeInstance.
   */
  protected async persistOnSuspend(flowNodeInstance: TFlowNode, processToken: Runtime.Types.ProcessToken): Promise<void> {

    await this.flowNodeInstanceService.suspend(flowNodeInstance.id, this.flowNodeInstanceId, processToken);

    const now: moment.Moment = moment.utc();

    this.metricsApiService.writeOnFlowNodeInstanceSuspend(processToken.correlationId,
                                                       processToken.processModelId,
                                                       this.flowNodeInstanceId,
                                                       flowNodeInstance.id,
                                                       processToken,
                                                       now);

    this.loggingApiService.writeLogForFlowNode(processToken.correlationId,
                                               processToken.processModelId,
                                               processToken.processInstanceId,
                                               this.flowNodeInstanceId,
                                               flowNodeInstance.id,
                                               LogLevel.info,
                                               'Flow Node execution suspended.');
  }

  /**
   * Resumes execution of the given suspended FlowNodeInstance.
   *
   * @async
   * @param flowNodeInstance The FlowNodeInstance to resume.
   * @param processToken     The current ProcessToken of the FlowNodeInstance.
   */
  protected async persistOnResume(flowNodeInstance: TFlowNode, processToken: Runtime.Types.ProcessToken): Promise<void> {

    await this.flowNodeInstanceService.resume(flowNodeInstance.id, this.flowNodeInstanceId, processToken);

    const now: moment.Moment = moment.utc();

    this.metricsApiService.writeOnFlowNodeInstanceResume(processToken.correlationId,
                                                      processToken.processModelId,
                                                      this.flowNodeInstanceId,
                                                      flowNodeInstance.id,
                                                      processToken,
                                                      now);

    this.loggingApiService.writeLogForFlowNode(processToken.correlationId,
                                               processToken.processModelId,
                                               processToken.processInstanceId,
                                               this.flowNodeInstanceId,
                                               flowNodeInstance.id,
                                               LogLevel.info,
                                               'Flow Node execution resumed.');
  }

  /**
   * Performs post-execution operations for the FlowNode that this Handler is
   * responsible for.
   *
   * This includes evaluating mappers on the succeeding FlowNodes or
   * SequenceFlows.
   *
   * @async
   * @param flowNode           The FlowNode for which to perform post-execution
   *                           operations.
   * @param nextFlowNode       The FlowNode that follows after this one.
   * @param processTokenFacade The ProcessTokenFacade of the curently running
   *                           process.
   * @param processModelFacade The ProcessModelFacade of the curently running
   *                           process.
   */
  private async afterExecute(flowNode: TFlowNode,
                             nextFlowNode: Model.Base.FlowNode,
                             processTokenFacade: IProcessTokenFacade,
                             processModelFacade: IProcessModelFacade): Promise<void> {

    // There are two kinds of Mappers to evaluate: FlowNode- and SequenceFlow-Mappers.
    // They are evaluated in between handling of FlowNodes.
    await processTokenFacade.evaluateMapperForFlowNode(flowNode);

    const nextSequenceFlow: Model.Types.SequenceFlow = processModelFacade.getSequenceFlowBetween(flowNode, nextFlowNode);

    if (!nextSequenceFlow) {
      return;
    }

    await processTokenFacade.evaluateMapperForSequenceFlow(nextSequenceFlow);
  }
}