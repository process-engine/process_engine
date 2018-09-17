import {IEventAggregator, ISubscription} from '@essential-projects/event_aggregator_contracts';
import {IIdentity} from '@essential-projects/iam_contracts';

import {InternalServerError} from '@essential-projects/errors_ts';

import {
  eventAggregatorSettings,
  ICorrelationService,
  IExecuteProcessService,
  IExecutionContextFacade,
  IFlowNodeHandler,
  IFlowNodeHandlerFactory,
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessModelService,
  IProcessTokenFacade,
  IProcessTokenResult,
  Model,
  NextFlowNodeInfo,
  ProcessEndedMessage,
  Runtime,
} from '@process-engine/process_engine_contracts';

import {ProcessModelFacade} from './process_model_facade';
import {ProcessTokenFacade} from './process_token_facade';

import * as uuid from 'uuid';

import {Logger} from 'loggerhythm';

const logger: Logger = Logger.createLogger('processengine:execute_process_service');

interface IProcessStateInfo {
  processTerminationSubscription?: ISubscription;
  processTerminatedMessage?: ProcessEndedMessage;
}

export class ExecuteProcessService implements IExecuteProcessService {

  private _eventAggregator: IEventAggregator = undefined;
  private _flowNodeHandlerFactory: IFlowNodeHandlerFactory = undefined;
  private _flowNodeInstanceService: IFlowNodeInstanceService = undefined;
  private _correlationService: ICorrelationService = undefined;
  private _processModelService: IProcessModelService = undefined;

  constructor(correlationService: ICorrelationService,
              eventAggregator: IEventAggregator,
              flowNodeHandlerFactory: IFlowNodeHandlerFactory,
              flowNodeInstanceService: IFlowNodeInstanceService,
              processModelService: IProcessModelService) {

    this._correlationService = correlationService;
    this._eventAggregator = eventAggregator;
    this._flowNodeHandlerFactory = flowNodeHandlerFactory;
    this._flowNodeInstanceService = flowNodeInstanceService;
    this._processModelService = processModelService;
  }

  private get flowNodeHandlerFactory(): IFlowNodeHandlerFactory {
    return this._flowNodeHandlerFactory;
  }

  private get correlationService(): ICorrelationService {
    return this._correlationService;
  }

  private get flowNodeInstanceService(): IFlowNodeInstanceService {
    return this._flowNodeInstanceService;
  }

  private get processModelService(): IProcessModelService {
    return this._processModelService;
  }

  private get eventAggregator(): IEventAggregator {
    return this._eventAggregator;
  }

  public async start(executionContextFacade: IExecutionContextFacade,
                     processModel: Model.Types.Process,
                     startEventId: string,
                     correlationId: string,
                     initialPayload?: any,
                     caller?: string): Promise<IProcessTokenResult> {

    const processModelFacade: IProcessModelFacade = new ProcessModelFacade(processModel);

    const startEvent: Model.Events.StartEvent = processModelFacade.getStartEventById(startEventId);

    const processInstanceId: string = uuid.v4();

    if (!correlationId) {
      correlationId = uuid.v4();
    }

    if (initialPayload === undefined || initialPayload === null) {
      initialPayload = {};
    }

    const identity: IIdentity = await executionContextFacade.getIdentity();
    const processTokenFacade: IProcessTokenFacade = new ProcessTokenFacade(processInstanceId, processModel.id, correlationId, identity);

    const processToken: Runtime.Types.ProcessToken = processTokenFacade.createProcessToken(initialPayload);
    processToken.caller = caller;
    processTokenFacade.addResultForFlowNode(startEvent.id, initialPayload);

    const processStateInfo: IProcessStateInfo = {};

    const processTerminatedEvent: string = eventAggregatorSettings.routePaths.processTerminated
      .replace(eventAggregatorSettings.routeParams.processInstanceId, processInstanceId);

    const processTerminationSubscription: ISubscription = this.eventAggregator
      .subscribe(processTerminatedEvent, async(message: ProcessEndedMessage): Promise<void> => {
          processStateInfo.processTerminatedMessage = message;
      });

    await this._saveCorrelation(executionContextFacade, correlationId, processModel);

    await this._executeFlowNode(startEvent, processToken, processTokenFacade, processModelFacade, executionContextFacade, processStateInfo);

    const resultToken: IProcessTokenResult = await this._getFinalResult(processTokenFacade);

    const processTerminationSubscriptionIsActive: boolean = processTerminationSubscription !== undefined;
    if (processTerminationSubscriptionIsActive) {
      processTerminationSubscription.dispose();
    }

    const processWasTerminated: boolean = processStateInfo.processTerminatedMessage !== undefined;

    if (processWasTerminated) {
      throw new InternalServerError(`Process was terminated through TerminateEndEvent "${processStateInfo.processTerminatedMessage.flowNodeId}."`);
    }

    return resultToken;
  }

  public async startAndAwaitSpecificEndEvent(executionContextFacade: IExecutionContextFacade,
                                             processModel: Model.Types.Process,
                                             startEventId: string,
                                             correlationId: string,
                                             endEventId: string,
                                             initialPayload?: any,
                                             caller?: string): Promise<ProcessEndedMessage> {

    return new Promise<ProcessEndedMessage>(async(resolve: Function, reject: Function): Promise<void> => {

      const subscription: ISubscription =
        this.eventAggregator.subscribeOnce(eventAggregatorSettings.messagePaths.processEnded, async(message: ProcessEndedMessage): Promise<void> => {
          resolve(message);
        });

      try {
        await this.start(executionContextFacade, processModel, startEventId, correlationId, initialPayload, caller);
      } catch (error) {
        const errorLogMessage: string =
          `An error occured while trying to execute process model with id "${processModel.id}" in correlation "${correlationId}".`;
        logger.error(errorLogMessage, error);

        const subscriptionIsActive: boolean = subscription !== undefined;
        if (subscriptionIsActive) {
          subscription.dispose();
        }

        // If we received an error that was thrown by an ErrorEndEvent, pass on the error as it was received.
        // Otherwise, pass on an anonymous error.
        if (error.errorCode && error.name) {
          return reject(error);
        }

        reject(new InternalServerError(error.message));
      }
    });
  }

  public async startAndAwaitEndEvent(executionContextFacade: IExecutionContextFacade,
                                     processModel: Model.Types.Process,
                                     startEventId: string,
                                     correlationId: string,
                                     initialPayload?: any,
                                     caller?: string): Promise<ProcessEndedMessage> {

    const processModelFacade: IProcessModelFacade = new ProcessModelFacade(processModel);

    const endEvents: Array<Model.Events.EndEvent> = processModelFacade.getEndEvents();
    const subscriptions: Array<ISubscription> = [];

    return new Promise<ProcessEndedMessage>(async(resolve: Function, reject: Function): Promise<void> => {
      for (const endEvent of endEvents) {

        const subscription: ISubscription
          = this.eventAggregator.subscribeOnce(`/processengine/node/${endEvent.id}`, async(message: ProcessEndedMessage): Promise<void> => {

          for (const existingSubscription of subscriptions) {
            existingSubscription.dispose();
          }

          resolve(message);
        });

        subscriptions.push(subscription);
      }

      try {
        await this.start(executionContextFacade, processModel, startEventId, correlationId, initialPayload, caller);
      } catch (error) {
        const errorLogMessage: string =
          `An error occured while trying to execute process model with id "${processModel.id}" in correlation "${correlationId}".`;
        logger.error(errorLogMessage, error);

        for (const subscription of subscriptions) {
          subscription.dispose();
        }

        // If we received an error that was thrown by an ErrorEndEvent, pass on the error as it was received.
        // Otherwise, pass on an anonymous error.
        if (error.errorCode && error.name) {
          return reject(error);
        }

        reject(new InternalServerError(error.message));
      }

    });
  }

  private async _saveCorrelation(executionContextFacade: IExecutionContextFacade,
                                 correlationId: string,
                                 processModel: Model.Types.Process,
                                ): Promise<void> {

    const processDefinition: Runtime.Types.ProcessDefinitionFromRepository =
      await this.processModelService.getProcessDefinitionAsXmlByName(executionContextFacade, processModel.id);

    await this.correlationService.createEntry(correlationId, processDefinition.hash);
  }

  private async _executeFlowNode(flowNode: Model.Base.FlowNode,
                                 processToken: Runtime.Types.ProcessToken,
                                 processTokenFacade: IProcessTokenFacade,
                                 processModelFacade: IProcessModelFacade,
                                 executionContextFacade: IExecutionContextFacade,
                                 processStateInfo: IProcessStateInfo): Promise<void> {

    const flowNodeHandler: IFlowNodeHandler<Model.Base.FlowNode> = await this.flowNodeHandlerFactory.create(flowNode, processModelFacade);

    const nextFlowNodeInfo: NextFlowNodeInfo =
      await flowNodeHandler.execute(flowNode, processToken, processTokenFacade, processModelFacade, executionContextFacade);

    const nextFlowNodeInfoHasFlowNode: boolean = nextFlowNodeInfo.flowNode !== undefined;

    const processWasTerminated: boolean = processStateInfo.processTerminatedMessage !== undefined;

    if (processWasTerminated) {
      const flowNodeInstanceId: string = flowNodeHandler.getInstanceId();
      await this.flowNodeInstanceService.persistOnTerminate(flowNode.id, flowNodeInstanceId, processToken);
    } else if (nextFlowNodeInfoHasFlowNode) {
      await this._executeFlowNode(nextFlowNodeInfo.flowNode,
                                  nextFlowNodeInfo.token,
                                  nextFlowNodeInfo.processTokenFacade,
                                  processModelFacade,
                                  executionContextFacade,
                                  processStateInfo);
    }
  }

  private async _getFinalResult(processTokenFacade: IProcessTokenFacade): Promise<IProcessTokenResult> {

    const allResults: Array<IProcessTokenResult> = await processTokenFacade.getAllResults();

    return allResults.pop();
  }

}
