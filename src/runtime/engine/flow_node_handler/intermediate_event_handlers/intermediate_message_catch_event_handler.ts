import {IEventAggregator, ISubscription} from '@essential-projects/event_aggregator_contracts';
import {IIdentity} from '@essential-projects/iam_contracts';

import {ILoggingApi} from '@process-engine/logging_api_contracts';
import {IMetricsApi} from '@process-engine/metrics_api_contracts';
import {
  eventAggregatorSettings,
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessTokenFacade,
  MessageEventReachedMessage,
  Model,
  NextFlowNodeInfo,
  Runtime,
} from '@process-engine/process_engine_contracts';

import {FlowNodeHandler} from '../index';

export class IntermediateMessageCatchEventHandler extends FlowNodeHandler<Model.Events.IntermediateCatchEvent> {

  private _eventAggregator: IEventAggregator;

  constructor(eventAggregator: IEventAggregator,
              flowNodeInstanceService: IFlowNodeInstanceService,
              loggingService: ILoggingApi,
              metricsService: IMetricsApi) {
    super(flowNodeInstanceService, loggingService, metricsService);
    this._eventAggregator = eventAggregator;
  }

  private get eventAggregator(): IEventAggregator {
    return this._eventAggregator;
  }

  protected async executeInternally(messageCatchEvent: Model.Events.IntermediateCatchEvent,
                                    token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    identity: IIdentity): Promise<NextFlowNodeInfo> {

    await this.persistOnEnter(messageCatchEvent, token);
    await this.persistOnSuspend(messageCatchEvent, token);

    const receivedMessage: MessageEventReachedMessage = await this._waitForMessage(messageCatchEvent.messageEventDefinition.name);

    processTokenFacade.addResultForFlowNode(messageCatchEvent.id, receivedMessage.currentToken);
    token.payload = receivedMessage.currentToken;

    await this.persistOnResume(messageCatchEvent, token);

    const nextFlowNodeInfo: Model.Base.FlowNode = processModelFacade.getNextFlowNodeFor(messageCatchEvent);

    await this.persistOnExit(messageCatchEvent, token);

    return new NextFlowNodeInfo(nextFlowNodeInfo, token, processTokenFacade);
  }

  private async _waitForMessage(messageToWaitFor: string): Promise<MessageEventReachedMessage> {

    return new Promise<MessageEventReachedMessage>((resolve: Function): void => {

      const messageEventName: string = eventAggregatorSettings.routePaths.messageEventReached
        .replace(eventAggregatorSettings.routeParams.messageReference, messageToWaitFor);

      const subscription: ISubscription = this.eventAggregator.subscribeOnce(messageEventName, async(message: MessageEventReachedMessage) => {

        if (subscription) {
          subscription.dispose();
        }

        return resolve(message);
      });
    });
  }
}