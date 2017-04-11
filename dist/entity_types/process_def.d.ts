import { ExecutionContext, IEntity, IInheritedSchema, IPublicGetOptions, IEntityReference } from '@process-engine-js/core_contracts';
import { Entity, EntityDependencyHelper, EntityCollection } from '@process-engine-js/data_model_contracts';
import { IProcessDefEntityTypeService, IProcessDefEntity, IParamUpdateDefs, IParamStart, IProcessRepository } from '@process-engine-js/process_engine_contracts';
import { ITimingService } from '@process-engine-js/timing_contracts';
import { IEventAggregator } from '@process-engine-js/event_aggregator_contracts';
import { IFeature, IFeatureService } from '@process-engine-js/feature_contracts';
import { IMessageBusService } from '@process-engine-js/messagebus_contracts';
import { IRoutingService } from '@process-engine-js/routing_contracts';
export declare class ProcessDefEntity extends Entity implements IProcessDefEntity {
    private _messageBusService;
    private _eventAggregator;
    private _timingService;
    private _processDefEntityTypeService;
    private _processRepository;
    private _featureService;
    private _routingService;
    constructor(processDefEntityTypeService: IProcessDefEntityTypeService, processRepository: IProcessRepository, featureService: IFeatureService, messageBusService: IMessageBusService, routingService: IRoutingService, eventAggregator: IEventAggregator, timingService: ITimingService, entityDependencyHelper: EntityDependencyHelper, context: ExecutionContext, schema: IInheritedSchema);
    initialize(derivedClassInstance: IEntity): Promise<void>;
    private readonly eventAggregator;
    private readonly timingService;
    private readonly processDefEntityTypeService;
    private readonly processRepository;
    private readonly featureService;
    private readonly messageBusService;
    private readonly routingService;
    name: string;
    key: string;
    defId: string;
    xml: string;
    extensions: any;
    internalName: string;
    path: string;
    category: string;
    module: string;
    readonly: boolean;
    version: string;
    counter: number;
    readonly nodeDefCollection: EntityCollection;
    getNodeDefCollection(context: ExecutionContext): Promise<EntityCollection>;
    readonly features: Array<IFeature>;
    start(context: ExecutionContext, params: IParamStart, options?: IPublicGetOptions): Promise<IEntityReference>;
    updateBpmn(context: ExecutionContext, params?: any): Promise<any>;
    private _parseTimerDefinitionType(eventDefinition);
    private _parseTimerDefinition(eventDefinition);
    private startTimers(processes, context);
    private _startTimer(timerDefinitionType, timerDefinition, callback, context);
    updateDefinitions(context: ExecutionContext, params?: IParamUpdateDefs): Promise<void>;
    private _updateLanes(lanes, context, counter);
    private _updateNodes(nodes, laneCache, bpmnDiagram, context, counter);
    private _updateFlows(flows, nodeCache, context, counter);
    private _createBoundaries(nodes, nodeCache, context);
    private _updateExtensionElements(extensionElements);
    private _extractFeatures();
}
