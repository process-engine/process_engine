import { EventEntity } from './event';
import { ExecutionContext, IFactory, IInheritedSchema } from '@process-engine-js/core_contracts';
import { IEntityType, IPropertyBag } from '@process-engine-js/data_model_contracts';
import { IInvoker } from '@process-engine-js/invocation_contracts';
import { IEndEventEntity } from '@process-engine-js/process_engine_contracts';
export declare class EndEventEntity extends EventEntity implements IEndEventEntity {
    constructor(propertyBagFactory: IFactory<IPropertyBag>, invoker: IInvoker, entityType: IEntityType<EndEventEntity>, context: ExecutionContext, schema: IInheritedSchema);
}
