import { IExecutionContextFacade, IProcessModelFacade, IProcessTokenFacade, Model, NextFlowNodeInfo, IFlowNodeInstancePersistance,
  Runtime } from '@process-engine/process_engine_contracts';
import { FlowNodeHandler } from './index';

export class StartEventHandler extends FlowNodeHandler<Model.Events.StartEvent> {

  private _flowNodeInstancePersistance: IFlowNodeInstancePersistance = undefined;

  constructor(flowNodeInstancePersistance: IFlowNodeInstancePersistance) {
    super();
    this._flowNodeInstancePersistance = flowNodeInstancePersistance;
  }

  private get flowNodeInstancePersistance(): IFlowNodeInstancePersistance {
    return this._flowNodeInstancePersistance;
  }

  protected async executeInternally(flowNode: Model.Events.StartEvent,
                                    token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    executionContextFacade: IExecutionContextFacade): Promise<NextFlowNodeInfo> { 

    const flowNodeInstanceId: string = super.createFlowNodeInstanceId();
    
    await this.flowNodeInstancePersistance.persistOnEnter(token, flowNode.id, flowNodeInstanceId);
    
    const nextFlowNode: Model.Base.FlowNode = await processModelFacade.getNextFlowNodeFor(flowNode);

    await this.flowNodeInstancePersistance.persistOnExit(token, flowNode.id, flowNodeInstanceId);

    return new NextFlowNodeInfo(nextFlowNode, token, processTokenFacade);
  }
}
