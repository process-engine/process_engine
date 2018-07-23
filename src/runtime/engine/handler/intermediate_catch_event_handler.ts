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

import {IContainer} from 'addict-ioc';

export class IntermediateCatchEventHandler extends FlowNodeHandler<Model.Events.IntermediateCatchEvent> {

  private _container: IContainer = undefined;

  constructor(container: IContainer) {
    super();
    this._container = container;
  }

  private get container(): IContainer {
    return this._container;
  }

  protected async executeInternally(flowNode: Model.Events.IntermediateCatchEvent,
                                    token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    executionContextFacade: IExecutionContextFacade): Promise<NextFlowNodeInfo> {

    if (flowNode.messageEventDefinition) {
      return this._executeIntermediateCatchEventByType('IntermediateMessageCatchEventHandler',
                                                       flowNode,
                                                       token,
                                                       processTokenFacade,
                                                       processModelFacade,
                                                       executionContextFacade);
    }

    // TODO: Default behavior, in case an intermediate event is used that is not yet implemented.
    // Can probably be removed, once we support Signals and Timers.
    return this._persistAndContinue(flowNode, token, processTokenFacade, processModelFacade, executionContextFacade);
  }

  private async _executeIntermediateCatchEventByType(eventHandlerName: string,
                                                     flowNode: Model.Events.IntermediateCatchEvent,
                                                     token: Runtime.Types.ProcessToken,
                                                     processTokenFacade: IProcessTokenFacade,
                                                     processModelFacade: IProcessModelFacade,
                                                     executionContextFacade: IExecutionContextFacade): Promise<NextFlowNodeInfo> {

    const eventHandler: FlowNodeHandler<Model.Events.IntermediateCatchEvent> =
      await this.container.resolveAsync<FlowNodeHandler<Model.Events.IntermediateCatchEvent>>(eventHandlerName);

    return eventHandler.execute(flowNode, token, processTokenFacade, processModelFacade, executionContextFacade);
  }

  private async _persistAndContinue(flowNode: Model.Events.IntermediateCatchEvent,
                                    token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    executionContextFacade: IExecutionContextFacade): Promise<NextFlowNodeInfo> {

    const flowNodeInstanceService: IFlowNodeInstanceService = await this.container.resolveAsync<IFlowNodeInstanceService>('FlowNodeInstanceService');

    const flowNodeInstanceId: string = super.createFlowNodeInstanceId();

    await flowNodeInstanceService.persistOnEnter(executionContextFacade, token, flowNode.id, flowNodeInstanceId);

    const nextFlowNodeInfo: Model.Base.FlowNode = processModelFacade.getNextFlowNodeFor(flowNode);

    await flowNodeInstanceService.persistOnExit(executionContextFacade, token, flowNode.id, flowNodeInstanceId);

    return new NextFlowNodeInfo(nextFlowNodeInfo, token, processTokenFacade);
  }
}
