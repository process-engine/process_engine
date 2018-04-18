import {ExecutionContext, IEntity, IInheritedSchema, IToPojoOptions, SchemaAttributeType} from '@essential-projects/core_contracts';
import {EntityDependencyHelper, IEntityType, IPropertyBag} from '@essential-projects/data_model_contracts';
import {schemaAttribute} from '@essential-projects/metadata';
import {IScriptTaskEntity} from '@process-engine/process_engine_contracts';
import {NodeInstanceEntity, NodeInstanceEntityDependencyHelper} from './node_instance';

export class ScriptTaskEntity extends NodeInstanceEntity implements IScriptTaskEntity {

  constructor(nodeInstanceEntityDependencyHelper: NodeInstanceEntityDependencyHelper,
              entityDependencyHelper: EntityDependencyHelper,
              context: ExecutionContext,
              schema: IInheritedSchema,
              propertyBag: IPropertyBag,
              entityType: IEntityType<IEntity>) {
    super(nodeInstanceEntityDependencyHelper, entityDependencyHelper, context, schema, propertyBag, entityType);
  }

  public async initialize(): Promise<void> {
    await super.initialize(this);
  }

  @schemaAttribute({ type: SchemaAttributeType.string })
  public get script(): string {
    return this.getProperty(this, 'script');
  }

  public set script(value: string) {
    this.setProperty(this, 'script', value);
  }

  public async execute(context): Promise<void> {
    this.state = 'progress';

    const processToken = this.processToken;

    const tokenData = processToken.data || {};
    let continueEnd = true;
    let result;

    // call service
    const nodeDef = this.nodeDef;

    const script = nodeDef.script;

    if (script) {
      try {
        const scriptFunction = new Function('token', 'context', script);
        result = await scriptFunction.call(this, tokenData, context);
      } catch (err) {
        result = err;
        continueEnd = false;
        this.error(context, err);
      }

      let finalResult = result;
      const toPojoOptions: IToPojoOptions = { skipCalculation: true };
      if (result && typeof result.toPojos === 'function') {
        finalResult = await result.toPojos(context, toPojoOptions);
      } else if (result && typeof result.toPojo === 'function') {
        finalResult = await result.toPojo(context, toPojoOptions);
      }

      tokenData.current = finalResult;
      processToken.data = tokenData;
    }

    if (continueEnd) {
      this.changeState(context, 'end', this);
    }

  }
}
