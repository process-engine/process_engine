define(["require", "exports", "@process-engine-js/data_model_contracts", "debug"], function (require, exports, data_model_contracts_1, debug) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const debugInfo = debug('processengine:info');
    const debugErr = debug('processengine:error');
    class NodeInstanceEntityTypeService {
        constructor(datastoreServiceFactory, messagebusService, iamService, eventAggregator, featureService, routingService, processEngineService) {
            this._datastoreService = undefined;
            this._datastoreServiceFactory = undefined;
            this._messagebusService = undefined;
            this._eventAggregator = undefined;
            this._iamService = undefined;
            this._featureService = undefined;
            this._routingService = undefined;
            this._processEngineService = undefined;
            this._datastoreServiceFactory = datastoreServiceFactory;
            this._messagebusService = messagebusService;
            this._eventAggregator = eventAggregator;
            this._iamService = iamService;
            this._featureService = featureService;
            this._routingService = routingService;
            this._processEngineService = processEngineService;
        }
        get datastoreService() {
            if (!this._datastoreService) {
                this._datastoreService = this._datastoreServiceFactory();
            }
            return this._datastoreService;
        }
        get messagebusService() {
            return this._messagebusService;
        }
        get eventAggregator() {
            return this._eventAggregator;
        }
        get iamService() {
            return this._iamService;
        }
        get featureService() {
            return this._featureService;
        }
        get routingService() {
            return this._routingService;
        }
        get processEngineService() {
            return this._processEngineService;
        }
        async _nodeHandler(event) {
            const binding = this;
            const action = (event && event.data && event.data.action) ? event.data.action : null;
            const source = (event && event.source) ? event.source : null;
            const context = (event && event.metadata && event.metadata.context) ? event.metadata.context : {};
            const applicationId = (event && event.metadata && event.metadata.applicationId) ? event.metadata.applicationId : null;
            const participant = (event && event.metadata && event.metadata.options && event.metadata.options.participantId) ? event.metadata.options.participantId : null;
            if (action === 'changeState') {
                const newState = (event && event.data && event.data.data) ? event.data.data : null;
                switch (newState) {
                    case ('start'):
                        await binding.entity.start(context, source);
                        break;
                    case ('execute'):
                        await binding.entity.execute(context);
                        break;
                    case ('end'):
                        await binding.entity.end(context);
                        break;
                    case ('follow'):
                        await binding.entity.followBoundary(context);
                        break;
                    default:
                }
            }
            if (action === 'proceed') {
                const newData = (event && event.data && event.data.token) ? event.data.token : null;
                await binding.entity.proceed(context, newData, source, applicationId, participant);
            }
            if (action === 'boundary') {
                const eventEntity = (event && event.data && event.data.eventEntity) ? event.data.eventEntity : null;
                const data = (event && event.data && event.data.data) ? event.data.data : null;
                await binding.entity.boundaryEvent(context, eventEntity, data, source, applicationId, participant);
            }
            if (action === 'event') {
                const eventType = (event && event.data && event.data.eventType) ? event.data.eventType : null;
                const data = (event && event.data && event.data.data) ? event.data.data : null;
                await binding.entity.event(context, eventType, data, source, applicationId, participant);
            }
        }
        async _nodeHandlerMessagebus(msg) {
            const binding = this;
            await binding.messagebusService.verifyMessage(msg);
            const context = (msg && msg.metadata && msg.metadata.context) ? msg.metadata.context : {};
            const sourceRef = (msg && msg.source) ? msg.source : null;
            let source = null;
            if (sourceRef) {
                if (sourceRef._meta.type === 'Process') {
                    if (binding.entity.processEngineService.activeInstances.hasOwnProperty(sourceRef.id)) {
                        source = binding.entity.processEngineService.activeInstances[sourceRef.id];
                    }
                }
                if (!source) {
                    const entityType = await binding.datastoreService.getEntityType(sourceRef._meta.type);
                    try {
                        source = await entityType.getById(sourceRef.id, context);
                    }
                    catch (err) {
                    }
                }
            }
            const payload = (msg && msg.data) ? msg.data : null;
            const action = (payload && payload.action) ? payload.action : null;
            if (action === 'proceed') {
                const newData = (payload && payload.token) ? payload.token : null;
                const applicationId = msg.metadata.applicationId;
                const participant = (msg.metadata.options) ? msg.metadata.options.participantId : null;
                await binding.entity.proceed(context, newData, source, applicationId, participant);
            }
            if (action === 'event') {
                const eventType = (payload && payload.eventType) ? payload.eventType : null;
                const data = (payload && payload.data) ? payload.data : null;
                binding.entity.triggerEvent(context, eventType, data);
            }
        }
        async createNode(context, entityType) {
            const internalContext = await this.iamService.createInternalContext('processengine_system');
            const node = await entityType.createEntity(internalContext);
            const binding = {
                entity: node,
                eventAggregator: this.eventAggregator,
                messagebusService: this.messagebusService,
                datastoreService: this.datastoreService
            };
            const anyNode = node;
            anyNode.eventAggregatorSubscription = this.eventAggregator.subscribe('/processengine/node/' + node.id, this._nodeHandler.bind(binding));
            anyNode.messagebusSubscription = this.messagebusService.subscribe('/processengine/node/' + node.id, this._nodeHandlerMessagebus.bind(binding));
            return anyNode;
        }
        async createNextNode(context, source, nextDef, token) {
            const process = source.process;
            let applicationId = source.application;
            const map = new Map();
            map.set('bpmn:UserTask', 'UserTask');
            map.set('bpmn:ExclusiveGateway', 'ExclusiveGateway');
            map.set('bpmn:ParallelGateway', 'ParallelGateway');
            map.set('bpmn:ServiceTask', 'ServiceTask');
            map.set('bpmn:StartEvent', 'StartEvent');
            map.set('bpmn:EndEvent', 'EndEvent');
            map.set('bpmn:IntermediateCatchEvent', 'CatchEvent');
            map.set('bpmn:IntermediateThrowEvent', 'ThrowEvent');
            map.set('bpmn:ScriptTask', 'ScriptTask');
            map.set('bpmn:BoundaryEvent', 'BoundaryEvent');
            map.set('bpmn:CallActivity', 'SubprocessExternal');
            map.set('bpmn:SubProcess', 'SubprocessInternal');
            const className = map.get(nextDef.type);
            const entityType = await this.datastoreService.getEntityType(className);
            const currentDef = source.nodeDef;
            const currentLane = currentDef.lane;
            const nextLane = nextDef.lane;
            if (currentLane && nextLane && currentLane.id !== nextLane.id) {
                const role = await nextDef.lane.role;
                if (role) {
                }
            }
            let node = null;
            let createNode = true;
            Object.keys(process.activeInstances).forEach((instanceId) => {
                const instance = process.activeInstances[instanceId];
                if (instance.key === nextDef.key) {
                    node = instance;
                }
            });
            let count = 0;
            if (token.data && token.data.history && token.data.history.hasOwnProperty(nextDef.key)) {
                if (Array.isArray(token.data.history[nextDef.key])) {
                    count = token.data.history[nextDef.key].length;
                }
                else {
                    count = 1;
                }
            }
            if (nextDef.type === 'bpmn:ParallelGateway' && node && node.state === 'wait') {
                if (node) {
                    const data = {
                        action: 'proceed',
                        token: null
                    };
                    const event = this.eventAggregator.createEntityEvent(data, source, context, (source && ('participant' in source) ? { participantId: source.participant } : null));
                    this.eventAggregator.publish('/processengine/node/' + node.id, event);
                    createNode = false;
                }
            }
            if (createNode) {
                node = await this.createNode(context, entityType);
                node.name = nextDef.name;
                node.key = nextDef.key;
                node.process = process;
                node.nodeDef = nextDef;
                node.type = nextDef.type;
                node.processToken = token;
                node.application = applicationId;
                node.instanceCounter = count;
                if ('participant' in source) {
                    node.participant = source.participant;
                }
                if (nextDef.type === 'bpmn:BoundaryEvent') {
                    node.attachedToInstance = source;
                }
                debugInfo(`node created key '${node.key}'`);
                node.changeState(context, 'start', source);
            }
        }
        async continueExecution(context, source) {
            const internalContext = await this.iamService.createInternalContext('processengine_system');
            const processTokenEntityType = await this.datastoreService.getEntityType('ProcessToken');
            const nodeInstance = source;
            const splitToken = (nodeInstance.type === 'bpmn:ParallelGateway' && nodeInstance.parallelType === 'split') ? true : false;
            let nextDefs = [];
            const nodeDef = nodeInstance.nodeDef;
            const processDef = source.process.processDef;
            let flowsOut = [];
            if (nodeInstance.follow) {
                if (nodeInstance.follow.length > 0) {
                    for (let i = 0; i < processDef.flowDefCollection.data.length; i++) {
                        const flowDef = processDef.flowDefCollection.data[i];
                        if (nodeInstance.follow.indexOf(flowDef.id) !== -1) {
                            flowsOut.push(flowDef);
                        }
                    }
                }
            }
            else {
                for (let i = 0; i < processDef.flowDefCollection.data.length; i++) {
                    const flowDef = processDef.flowDefCollection.data[i];
                    if (flowDef.source.id === nodeDef.id) {
                        flowsOut.push(flowDef);
                    }
                }
            }
            if (flowsOut && flowsOut.length > 0) {
                const ids = [];
                const mappers = [];
                for (let i = 0; i < flowsOut.length; i++) {
                    const flow = flowsOut[i];
                    const target = flow.target;
                    ids.push(target.id);
                    mappers.push(flow.mapper);
                }
                await source.process.processDef.nodeDefCollection.each(internalContext, async (nodeDefEntity) => {
                    if (ids.indexOf(nodeDefEntity.id) !== -1 && nodeDefEntity.processDef.id === processDef.id) {
                        nextDefs.push(nodeDefEntity);
                    }
                });
                if (nextDefs.length > 0) {
                    const processToken = nodeInstance.processToken;
                    for (let i = 0; i < nextDefs.length; i++) {
                        const nextDef = nextDefs[i];
                        let currentToken;
                        const index = ids.indexOf(nextDef.id);
                        const mapper = (index !== -1) ? mappers[index] : undefined;
                        if (mapper !== undefined) {
                            const tokenData = processToken.data || {};
                            const newCurrent = (new Function('token', 'return ' + mapper)).call(tokenData, tokenData);
                            tokenData.current = newCurrent;
                            processToken.data = tokenData;
                            if (processDef.persist) {
                                await processToken.save(internalContext, { reloadAfterSave: false });
                            }
                        }
                        if (splitToken && i > 0) {
                            currentToken = await processTokenEntityType.createEntity(internalContext);
                            currentToken.process = processToken.process;
                            currentToken.data = processToken.data;
                            if (processDef.persist) {
                                await processToken.save(internalContext, { reloadAfterSave: false });
                            }
                        }
                        else {
                            currentToken = processToken;
                        }
                        const laneRef = await nextDef.lane;
                        const laneId = laneRef ? laneRef.id : undefined;
                        let laneFeatures = undefined;
                        for (let j = 0; j < processDef.laneCollection.data.length; j++) {
                            const lane = processDef.laneCollection.data[j];
                            if (lane.id === laneId) {
                                laneFeatures = lane.features;
                            }
                        }
                        const nodeFeatures = nextDef.features;
                        const processFeatures = processDef.features;
                        const features = this.featureService.mergeFeatures(nodeFeatures, laneFeatures, processFeatures);
                        if (features.length === 0 || this.featureService.hasFeatures(features)) {
                            debugInfo(`continue in same thread with next node key ${nextDef.key}, features: ${JSON.stringify(features)}`);
                            await this.createNextNode(context, nodeInstance, nextDef, currentToken);
                        }
                        else {
                            const appInstances = this.featureService.getApplicationIdsByFeatures(features);
                            if (appInstances.length === 0) {
                                debugErr(`can not route to next node key '${nextDef.key}', features: ${JSON.stringify(features)}, no matching instance found`);
                                throw new Error('can not route, no matching instance found');
                            }
                            const appInstanceId = appInstances[0];
                            debugInfo(`continue on application '${appInstanceId}' with next node key '${nextDef.key}', features: ${JSON.stringify(features)}`);
                            const options = {
                                action: 'POST',
                                typeName: 'NodeInstance',
                                method: 'continueFromRemote'
                            };
                            let data;
                            if (processDef.persist) {
                                data = [
                                    null,
                                    {
                                        source: nodeInstance.getEntityReference().toPojo(),
                                        nextDef: nextDef.getEntityReference().toPojo(),
                                        token: currentToken.getEntityReference().toPojo()
                                    }
                                ];
                            }
                            else {
                                data = [
                                    null,
                                    {
                                        source: await nodeInstance.toPojo(internalContext, { maxDepth: 1 }),
                                        nextDef: nextDef.getEntityReference().toPojo(),
                                        token: await currentToken.toPojo(internalContext, { maxDepth: 1 })
                                    }
                                ];
                            }
                            const message = this.messagebusService.createDatastoreMessage(options, context, data);
                            try {
                                const adapterKey = this.featureService.getRoutingAdapterKeyByApplicationId(appInstanceId);
                                await this.routingService.request(appInstanceId, message, adapterKey);
                            }
                            catch (err) {
                                debugErr(`can not route to next node key '${nextDef.key}', features: ${JSON.stringify(features)}, error: ${err.message}`);
                                if (nextDef && nextDef.events) {
                                    const event = nextDef.events.find((el) => {
                                        return el.type === 'error';
                                    });
                                    if (event) {
                                        const boundaryDefId = event.boundary;
                                        const boundaryEntity = nodeInstance.process.processDef.nodeDefCollection.data.find((el) => {
                                            return el.id === boundaryDefId;
                                        });
                                        await this.createNextNode(context, nodeInstance, boundaryEntity, currentToken);
                                    }
                                }
                                else {
                                    throw err;
                                }
                            }
                        }
                    }
                }
            }
        }
        async continueFromRemote(context, params, options) {
            let source = undefined;
            let token = undefined;
            let nextDef = undefined;
            try {
                const internalContext = await this.iamService.createInternalContext('processengine_system');
                const processTokenEntityType = await this.datastoreService.getEntityType('ProcessToken');
                const nodeDefEntityType = await this.datastoreService.getEntityType('NodeDef');
                const nextDefRef = new data_model_contracts_1.EntityReference(params.nextDef._meta.namespace, params.nextDef._meta.type, params.nextDef.id);
                nextDef = await nodeDefEntityType.getById(nextDefRef.id, context);
                const processDef = await nextDef.getProcessDef(internalContext);
                if (params.source._meta.isRef) {
                    const sourceRef = new data_model_contracts_1.EntityReference(params.source._meta.namespace, params.source._meta.type, params.source.id);
                    const sourceEntityType = await this.datastoreService.getEntityType(sourceRef.type);
                    if (sourceEntityType && sourceRef.id) {
                        source = await sourceEntityType.getById(sourceRef.id, context);
                    }
                }
                else {
                    const sourceEntityType = await this.datastoreService.getEntityType(params.source._meta.type);
                    if (sourceEntityType) {
                        source = await sourceEntityType.createEntity(context, params.source);
                    }
                }
                if (params.token._meta.isRef) {
                    const tokenRef = new data_model_contracts_1.EntityReference(params.token._meta.namespace, params.token._meta.type, params.token.id);
                    token = await processTokenEntityType.getById(tokenRef.id, context);
                }
                else {
                    token = await processTokenEntityType.createEntity(context, params.token);
                }
                const sourceProcessRef = source && source.process ? source.process : undefined;
                let processEntity;
                if (sourceProcessRef) {
                    if (this.processEngineService.activeInstances.hasOwnProperty(sourceProcessRef.id)) {
                        processEntity = this.processEngineService.activeInstances[sourceProcessRef.id];
                    }
                    else {
                        const processData = {
                            key: processDef.key,
                            processDef: processDef
                        };
                        const processEntityType = await this.datastoreService.getEntityType('Process');
                        processEntity = (await processEntityType.createEntity(context, processData));
                        processEntity.status = 'progress';
                        if (processDef.persist) {
                            await processEntity.save(internalContext, { reloadAfterSave: false });
                        }
                        await processDef.getNodeDefCollection(internalContext);
                        await processDef.nodeDefCollection.each(internalContext, async (nodeDef) => {
                            nodeDef.processDef = processDef;
                        });
                        await processDef.getFlowDefCollection(internalContext);
                        await processDef.flowDefCollection.each(internalContext, async (flowDef) => {
                            flowDef.processDef = processDef;
                        });
                        await processDef.getLaneCollection(internalContext);
                        await processDef.laneCollection.each(internalContext, async (lane) => {
                            lane.processDef = processDef;
                        });
                        for (let i = 0; i < processDef.nodeDefCollection.length; i++) {
                            const nodeDef = processDef.nodeDefCollection.data[i];
                            if (nodeDef.lane) {
                                const laneId = nodeDef.lane.id;
                                for (let j = 0; j < processDef.laneCollection.length; j++) {
                                    const lane = processDef.laneCollection.data[j];
                                    if (lane.id === laneId) {
                                        nodeDef.lane = lane;
                                    }
                                }
                            }
                        }
                        this.processEngineService.addActiveInstance(processEntity);
                        processEntity.addActiveInstance(source);
                        processEntity.removeActiveInstance(source);
                    }
                    if (source && processEntity) {
                        source.process = processEntity;
                    }
                    if (source && token) {
                        if (processEntity) {
                            token.process = processEntity;
                        }
                        source.processToken = token;
                    }
                }
                if (source && token && nextDef) {
                    await this.createNextNode(context, source, nextDef, token);
                }
                else {
                    throw new Error('param is missing');
                }
            }
            catch (err) {
                debugErr(err);
                throw err;
            }
        }
    }
    exports.NodeInstanceEntityTypeService = NodeInstanceEntityTypeService;
});

//# sourceMappingURL=node_instance.js.map