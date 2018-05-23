import { Model, Runtime } from '@process-engine/process_engine_contracts';
import {
  IProcessModelFascade,
  IProcessTokenFascade,
  NextFlowNodeInfo,
} from './../../index';
import { FlowNodeHandler } from './index';

export class IntermediateCatchEventHandler extends FlowNodeHandler<Model.Events.Event> {
  protected async executeIntern(flowNode: Model.Events.Event,
                                processTokenFascade: IProcessTokenFascade,
                                processModelFascade: IProcessModelFascade): Promise<NextFlowNodeInfo> {

    const nextFlowNode: Model.Base.FlowNode = processModelFascade.getNextFlowNodeFor(flowNode);

    return new NextFlowNodeInfo(nextFlowNode, processTokenFascade);
  }
}
