import {IContainer} from 'addict-ioc';

import {InternalServerError} from '@essential-projects/errors_ts';
import {IIdentity} from '@essential-projects/iam_contracts';

import {ILoggingApi} from '@process-engine/logging_api_contracts';
import {IMetricsApi} from '@process-engine/metrics_api_contracts';
import {
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessTokenFacade,
  Model,
  NextFlowNodeInfo,
  Runtime,
} from '@process-engine/process_engine_contracts';

import {FlowNodeHandler} from './index';

export class IntermediateThrowEventHandler extends FlowNodeHandler<Model.Events.IntermediateThrowEvent> {

  private _childEventHandler: FlowNodeHandler<Model.Events.IntermediateCatchEvent>;
  private _container: IContainer = undefined;

  constructor(container: IContainer,
              flowNodeInstanceService: IFlowNodeInstanceService,
              loggingApiService: ILoggingApi,
              metricsService: IMetricsApi,
              intermediateThrowEventModel: Model.Events.IntermediateThrowEvent) {
    super(flowNodeInstanceService, loggingApiService, metricsService, intermediateThrowEventModel);
    this._container = container;
    this._childEventHandler = this._getChildEventHandler();
  }

  public getInstanceId(): string {
    return this._childEventHandler.getInstanceId();
  }

  private _getChildEventHandler(): FlowNodeHandler<Model.Events.IntermediateCatchEvent> {

    if (this.flowNode.messageEventDefinition) {
      return this._container.resolve<FlowNodeHandler<Model.Events.IntermediateCatchEvent>>('IntermediateMessageThrowEventHandler', [this.flowNode]);
    }

    if (this.flowNode.signalEventDefinition) {
      return this._container.resolve<FlowNodeHandler<Model.Events.IntermediateCatchEvent>>('IntermediateSignalThrowEventHandler', [this.flowNode]);
    }

    throw new InternalServerError(`The IntermediateThrowEventType used with FlowNode ${this.flowNode.id} is not supported!`);
  }

  protected async executeInternally(token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    identity: IIdentity): Promise<NextFlowNodeInfo> {

    return this._childEventHandler.execute(token, processTokenFacade, processModelFacade, identity, this.previousFlowNodeInstanceId);
  }
}
