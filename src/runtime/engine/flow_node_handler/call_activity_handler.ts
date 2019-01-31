import {IContainer} from 'addict-ioc';
import {Logger} from 'loggerhythm';

import {IIdentity} from '@essential-projects/iam_contracts';

import {DataModels as ConsumerApiTypes, IConsumerApi} from '@process-engine/consumer_api_contracts';
import {
  ICorrelationService,
  IProcessModelFacade,
  IProcessTokenFacade,
  IResumeProcessService,
  Model,
  Runtime,
} from '@process-engine/process_engine_contracts';

import {FlowNodeHandlerInterruptible} from './index';

export class CallActivityHandler extends FlowNodeHandlerInterruptible<Model.Activities.CallActivity> {

  private _consumerApiService: IConsumerApi;
  private _correlationService: ICorrelationService;
  private _resumeProcessService: IResumeProcessService;

  constructor(consumerApiService: IConsumerApi,
              container: IContainer,
              correlationService: ICorrelationService,
              resumeProcessService: IResumeProcessService,
              callActivityModel: Model.Activities.CallActivity) {
    super(container, callActivityModel);
    this._consumerApiService = consumerApiService;
    this._correlationService = correlationService;
    this._resumeProcessService = resumeProcessService;
    this.logger = new Logger(`processengine:call_activity_handler:${callActivityModel.id}`);
  }

  private get callActivity(): Model.Activities.CallActivity {
    return super.flowNode;
  }

  // TODO: We can't interrupt a Subprocess yet, so this will remain inactive.
  public interrupt(token: Runtime.Types.ProcessToken, terminate?: boolean): Promise<void> {
    return Promise.resolve();
  }

  protected async executeInternally(
    token: Runtime.Types.ProcessToken,
    processTokenFacade: IProcessTokenFacade,
    processModelFacade: IProcessModelFacade,
    identity: IIdentity,
  ): Promise<Array<Model.Base.FlowNode>> {

    this.logger.verbose(`Executing CallActivity instance ${this.flowNodeInstanceId}`);
    await this.persistOnEnter(token);

    return this._executeHandler(token, processTokenFacade, processModelFacade, identity);
  }

  protected async _continueAfterSuspend(
    flowNodeInstance: Runtime.Types.FlowNodeInstance,
    onSuspendToken: Runtime.Types.ProcessToken,
    processTokenFacade: IProcessTokenFacade,
    processModelFacade: IProcessModelFacade,
    identity: IIdentity,
  ): Promise<Array<Model.Base.FlowNode>> {

    // First we need to find out if the Subprocess was already started.
    const correlation: Runtime.Types.Correlation
      = await this._correlationService.getSubprocessesForProcessInstance(identity, flowNodeInstance.processInstanceId);

    const noSubProcessesFound: boolean = correlation === undefined;

    const matchingSubProcess: Runtime.Types.CorrelationProcessModel = noSubProcessesFound
      ? undefined
      : correlation.processModels.find((entry: Runtime.Types.CorrelationProcessModel): boolean => {
          return entry.processModelId === this.callActivity.calledReference;
        });

    let callActivityResult: any;

    const callActivityNotYetExecuted: boolean = matchingSubProcess === undefined;
    if (callActivityNotYetExecuted) {
      // Subprocess not yet started. We need to run the handler again.
      const startEventId: string = await this._getAccessibleCallActivityStartEvent(identity);

      const processStartResponse: ConsumerApiTypes.ProcessModels.ProcessStartResponsePayload =
        await this._executeSubprocess(identity, startEventId, processTokenFacade, onSuspendToken);

      callActivityResult = processStartResponse.tokenPayload;
    } else {
      // Subprocess was already started. Resume it and wait for the result:
      callActivityResult =
        await this._resumeProcessService.resumeProcessInstanceById(identity, matchingSubProcess.processModelId, matchingSubProcess.processInstanceId);
    }

    onSuspendToken.payload = callActivityResult;
    await this.persistOnResume(onSuspendToken);
    processTokenFacade.addResultForFlowNode(this.callActivity.id, callActivityResult);
    await this.persistOnExit(onSuspendToken);

    return processModelFacade.getNextFlowNodesFor(this.callActivity);
  }

  protected async _executeHandler(
    token: Runtime.Types.ProcessToken,
    processTokenFacade: IProcessTokenFacade,
    processModelFacade: IProcessModelFacade,
    identity: IIdentity,
  ): Promise<Array<Model.Base.FlowNode>> {

    const startEventId: string = await this._getAccessibleCallActivityStartEvent(identity);

    await this.persistOnSuspend(token);

    const processStartResponse: ConsumerApiTypes.ProcessModels.ProcessStartResponsePayload =
      await this._executeSubprocess(identity, startEventId, processTokenFacade, token);

    token.payload = processStartResponse.tokenPayload;

    await this.persistOnResume(token);
    processTokenFacade.addResultForFlowNode(this.callActivity.id, processStartResponse.tokenPayload);
    await this.persistOnExit(token);

    return processModelFacade.getNextFlowNodesFor(this.callActivity);
  }

  /**
   * Retrieves the first accessible StartEvent for the ProcessModel with the
   * given ID.
   *
   * @async
   * @param   identity The users identity.
   * @returns          The retrieved StartEvent.
   */
  private async _getAccessibleCallActivityStartEvent(identity: IIdentity): Promise<string> {

    const processModel: ConsumerApiTypes.ProcessModels.ProcessModel =
      await this._consumerApiService.getProcessModelById(identity, this.callActivity.calledReference);

    /*
     * Note: If the user cannot access the process model and/or its start events,
     * the Consumer API will already have thrown an HTTP Unauthorized error,
     * so we do not need to handle those cases here.
     */
    const startEventId: string = processModel.startEvents[0].id;

    return startEventId;
  }

  /**
   * Uses the ConsumerAPI to execute the ProcessModel defined in the
   * CallActivity FlowNode.
   *
   * @async
   * @param identity           The users identity.
   * @param startEventId       The StartEvent by which to start the SubProcess.
   * @param processTokenFacade The Facade for accessing the current process' tokens.
   * @param token              The current ProcessToken.
   */
  private async _executeSubprocess(
    identity: IIdentity,
    startEventId: string,
    processTokenFacade: IProcessTokenFacade,
    token: Runtime.Types.ProcessToken,
  ): Promise<ConsumerApiTypes.ProcessModels.ProcessStartResponsePayload> {

    const tokenData: any = processTokenFacade.getOldTokenFormat();

    const processInstanceId: string = token.processInstanceId;
    const correlationId: string = token.correlationId;

    const startCallbackType: ConsumerApiTypes.ProcessModels.StartCallbackType =
      ConsumerApiTypes.ProcessModels.StartCallbackType.CallbackOnProcessInstanceFinished;

    const payload: ConsumerApiTypes.ProcessModels.ProcessStartRequestPayload = {
      correlationId: correlationId,
      callerId: processInstanceId,
      inputValues: tokenData.current || {},
    };

    const processModelId: string = this.callActivity.calledReference;

    try {
      const result: ConsumerApiTypes.ProcessModels.ProcessStartResponsePayload =
        await this._consumerApiService.startProcessInstance(identity, processModelId, startEventId, payload, startCallbackType);

      return result;
    } catch (error) {
      this.logger.error(error);

      await this.persistOnError(token, error);

      throw error;
    }
  }
}
