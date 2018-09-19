import {
  IExecutionContextFacade,
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessTokenFacade,
  MessageEndEventReachedMessage, // TODO: Rename to `MessageEventReachedMessage`
  Model,
  NextFlowNodeInfo,
  Runtime,
} from '@process-engine/process_engine_contracts';

import {IEventAggregator, ISubscription} from '@essential-projects/event_aggregator_contracts';

import {FlowNodeHandler} from '../index';

export class IntermediateMessageCatchEventHandler extends FlowNodeHandler<Model.Events.IntermediateCatchEvent> {

  private _eventAggregator: IEventAggregator;
  private _flowNodeInstanceService: IFlowNodeInstanceService = undefined;

  constructor(flowNodeInstanceService: IFlowNodeInstanceService, eventAggregator: IEventAggregator) {
    super();
    this._eventAggregator = eventAggregator;
    this._flowNodeInstanceService = flowNodeInstanceService;
  }

  private get eventAggregator(): IEventAggregator {
    return this._eventAggregator;
  }

  private get flowNodeInstanceService(): IFlowNodeInstanceService {
    return this._flowNodeInstanceService;
  }

  protected async executeInternally(flowNode: Model.Events.IntermediateCatchEvent,
                                    token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    executionContextFacade: IExecutionContextFacade): Promise<NextFlowNodeInfo> {

    await this.flowNodeInstanceService.persistOnEnter(flowNode.id, this.flowNodeInstanceId, token);
    await this.flowNodeInstanceService.suspend(flowNode.id, this.flowNodeInstanceId, token);

    const receivedMessage: MessageEndEventReachedMessage = await this._waitForMessage(flowNode.messageEventDefinition.messageRef);

    processTokenFacade.addResultForFlowNode(flowNode.id, receivedMessage.tokenPayload);
    token.payload = receivedMessage.tokenPayload;

    await this.flowNodeInstanceService.resume(flowNode.id, this.flowNodeInstanceId, token);

    const nextFlowNodeInfo: Model.Base.FlowNode = processModelFacade.getNextFlowNodeFor(flowNode);

    await this.flowNodeInstanceService.persistOnExit(flowNode.id, this.flowNodeInstanceId, token);

    return new NextFlowNodeInfo(nextFlowNodeInfo, token, processTokenFacade);
  }

  private async _waitForMessage(messageReference: string): Promise<MessageEndEventReachedMessage> {

    return new Promise<MessageEndEventReachedMessage>((resolve: Function): void => {

      const messageName: string = `/processengine/process/message/${messageReference}`;

      const subscription: ISubscription = this.eventAggregator.subscribeOnce(messageName, async(message: MessageEndEventReachedMessage) => {

        if (subscription) {
          subscription.dispose();
        }

        return resolve(message);
      });
    });
  }
}
