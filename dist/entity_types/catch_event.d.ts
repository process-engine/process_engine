import { EventEntity } from './event';
import { EntityDependencyHelper } from '@process-engine-js/data_model_contracts';
import { ExecutionContext, IEntity, IInheritedSchema } from '@process-engine-js/core_contracts';
import { ICatchEventEntity } from '@process-engine-js/process_engine_contracts';
import { NodeInstanceEntityDependencyHelper } from './node_instance';
export declare class CatchEventEntity extends EventEntity implements ICatchEventEntity {
    constructor(nodeInstanceEntityDependencyHelper: NodeInstanceEntityDependencyHelper, entityDependencyHelper: EntityDependencyHelper, context: ExecutionContext, schema: IInheritedSchema);
    initialize(derivedClassInstance: IEntity): Promise<void>;
    execute(context: ExecutionContext): Promise<void>;
    proceed(context: ExecutionContext, newData: any, source: IEntity, applicationId: string): Promise<void>;
}