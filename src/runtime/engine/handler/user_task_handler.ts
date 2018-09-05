import {IEventAggregator, ISubscription} from '@essential-projects/event_aggregator_contracts';
import {
  IExecutionContextFacade,
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessTokenFacade,
  Model,
  NextFlowNodeInfo,
  Runtime,
} from '@process-engine/process_engine_contracts';

import {FlowNodeHandler} from './index';

export class UserTaskHandler extends FlowNodeHandler<Model.Activities.UserTask> {

  private _eventAggregator: IEventAggregator = undefined;
  private _flowNodeInstanceService: IFlowNodeInstanceService = undefined;

  constructor(eventAggregator: IEventAggregator, flowNodeInstanceService: IFlowNodeInstanceService) {
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

  protected async executeInternally(userTask: Model.Activities.UserTask,
                                    token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    executionContextFacade: IExecutionContextFacade): Promise<NextFlowNodeInfo> {

    return new Promise<NextFlowNodeInfo>(async(resolve: Function): Promise<void> => {

      await this.flowNodeInstanceService.persistOnEnter(userTask.id, this.flowNodeInstanceId, token);

      const finishEvent: string =
        `/processengine/correlation/${token.correlationId}/processinstance/${token.processInstanceId}/node/${userTask.id}`;

      const subscription: ISubscription =
        this.eventAggregator.subscribeOnce(`${finishEvent}/finish`, async(message: any): Promise<void> => {

          await this.flowNodeInstanceService.resume(userTask.id, this.flowNodeInstanceId, token);

          const userTaskResult: any = {
            form_fields: message.data.token === undefined ? null : message.data.token,
          };

          processTokenFacade.addResultForFlowNode(userTask.id, userTaskResult);
          token.payload = userTaskResult;

          const nextNodeAfterUserTask: Model.Base.FlowNode = processModelFacade.getNextFlowNodeFor(userTask);

          await this.flowNodeInstanceService.persistOnExit(userTask.id, this.flowNodeInstanceId, token);

          this._sendUserTaskFinishedToConsumerApi(finishEvent);

          if (subscription) {
            subscription.dispose();
          }

          resolve(new NextFlowNodeInfo(nextNodeAfterUserTask, token, processTokenFacade));
        });

      await this.flowNodeInstanceService.suspend(userTask.id, this.flowNodeInstanceId, token);
    });

  }

  private _sendUserTaskFinishedToConsumerApi(finishEvent: string): void {

    this.eventAggregator.publish(`${finishEvent}/finished`, {});
  }
}
