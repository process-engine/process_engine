import {Model} from '@process-engine/process_model.contracts';
import {FlowNodeParsers} from './flow_node_parsers/index';

export function parseProcessFlowNodes(
  processData: any,
  errors: Array<Model.GlobalElements.Error>,
  eventDefinitions: Array<Model.Events.Definitions.EventDefinition>,
): Array<Model.Base.FlowNode> {

  let nodes: Array<Model.Base.FlowNode> = [];

  const events = FlowNodeParsers.EventParser.parseEventsFromProcessData(processData, errors, eventDefinitions);
  const gateways = FlowNodeParsers.GatewayParser.parseGatewaysFromProcessData(processData);
  const activities = FlowNodeParsers.ActivityParser.parseActivitiesFromProcessData(processData, errors, eventDefinitions);

  nodes = nodes.concat(gateways, activities, events);

  return nodes;
}
