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

import {IContainer} from 'addict-ioc';

export class IntermediateThrowEventHandler extends FlowNodeHandler<Model.Events.IntermediateThrowEvent> {

  private _container: IContainer = undefined;

  constructor(container: IContainer,
              flowNodeInstanceService: IFlowNodeInstanceService,
              loggingApiService: ILoggingApi,
              metricsService: IMetricsApi,
              intermediateThrowEventModel: Model.Events.IntermediateThrowEvent) {
    super(flowNodeInstanceService, loggingApiService, metricsService, intermediateThrowEventModel);
    this._container = container;
  }

  private get container(): IContainer {
    return this._container;
  }

  protected async executeInternally(token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    identity: IIdentity): Promise<NextFlowNodeInfo> {

    if (this.flowNode.messageEventDefinition) {
      return this._executeIntermediateThrowEventByType('IntermediateMessageThrowEventHandler',
                                                       token,
                                                       processTokenFacade,
                                                       processModelFacade,
                                                       identity);
    }

    if (this.flowNode.signalEventDefinition) {
      return this._executeIntermediateThrowEventByType('IntermediateSignalThrowEventHandler',
                                                       token,
                                                       processTokenFacade,
                                                       processModelFacade,
                                                       identity);
    }

    // TODO: Default behavior, in case an unsupported intermediate event is used.
    // Can probably be removed, once we support Signals.
    // Note that FlowNodeInstance persistence is usually delegated to the dedicated event handlers
    // ('IntermediateMessageCatchEventHandler', etc). Since this use case addresses events that are not yet supported,
    // this method must handle state persistence by itself.
    return this._persistAndContinue(token, processTokenFacade, processModelFacade, identity);
  }

  private async _executeIntermediateThrowEventByType(eventHandlerName: string,
                                                     token: Runtime.Types.ProcessToken,
                                                     processTokenFacade: IProcessTokenFacade,
                                                     processModelFacade: IProcessModelFacade,
                                                     identity: IIdentity): Promise<NextFlowNodeInfo> {

    const eventHandler: FlowNodeHandler<Model.Events.IntermediateThrowEvent> =
      await this.container.resolveAsync<FlowNodeHandler<Model.Events.IntermediateThrowEvent>>(eventHandlerName, [this.flowNode]);

    return eventHandler.execute(token, processTokenFacade, processModelFacade, identity, this.previousFlowNodeInstanceId);
  }

  private async _persistAndContinue(token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    identity: IIdentity): Promise<NextFlowNodeInfo> {

    await this.persistOnEnter(token);

    const nextFlowNodeInfo: Model.Base.FlowNode = processModelFacade.getNextFlowNodeFor(this.flowNode);

    await this.persistOnExit(token);

    return new NextFlowNodeInfo(nextFlowNodeInfo, token, processTokenFacade);
  }
}
