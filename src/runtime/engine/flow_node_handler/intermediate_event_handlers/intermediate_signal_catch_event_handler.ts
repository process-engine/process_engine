import * as Bluebird from 'bluebird';
import {Logger} from 'loggerhythm';

import {IEventAggregator, ISubscription} from '@essential-projects/event_aggregator_contracts';
import {IIdentity} from '@essential-projects/iam_contracts';

import {ILoggingApi} from '@process-engine/logging_api_contracts';
import {IMetricsApi} from '@process-engine/metrics_api_contracts';
import {
  eventAggregatorSettings,
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessTokenFacade,
  Model,
  NextFlowNodeInfo,
  Runtime,
  SignalEventReachedMessage,
} from '@process-engine/process_engine_contracts';

import {FlowNodeHandlerInterruptable} from '../index';

export class IntermediateSignalCatchEventHandler extends FlowNodeHandlerInterruptable<Model.Events.IntermediateCatchEvent> {

  private _eventAggregator: IEventAggregator;
  private subscription: ISubscription;

  constructor(eventAggregator: IEventAggregator,
              flowNodeInstanceService: IFlowNodeInstanceService,
              loggingService: ILoggingApi,
              metricsService: IMetricsApi,
              signalCatchEventModel: Model.Events.IntermediateCatchEvent) {
    super(flowNodeInstanceService, loggingService, metricsService, signalCatchEventModel);
    this._eventAggregator = eventAggregator;
    this.logger = Logger.createLogger(`processengine:signal_catch_event_handler:${signalCatchEventModel.id}`);
  }

  private get signalCatchEvent(): Model.Events.IntermediateCatchEvent {
    return super.flowNode;
  }

  protected async executeInternally(token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    identity: IIdentity): Promise<NextFlowNodeInfo> {

    this.logger.verbose(`Executing SignalCatchEvent instance ${this.flowNodeInstanceId}.`);
    await this.persistOnEnter(token);
    await this.persistOnSuspend(token);

    return await this._executeHandler(token, processTokenFacade, processModelFacade);
  }

  protected async _continueAfterEnter(onEnterToken: Runtime.Types.ProcessToken,
                                      processTokenFacade: IProcessTokenFacade,
                                      processModelFacade: IProcessModelFacade,
                                     ): Promise<NextFlowNodeInfo> {

    await this.persistOnSuspend(onEnterToken);

    return this._executeHandler(onEnterToken, processTokenFacade, processModelFacade);
  }

  protected async _continueAfterSuspend(flowNodeInstance: Runtime.Types.FlowNodeInstance,
                                        onSuspendToken: Runtime.Types.ProcessToken,
                                        processTokenFacade: IProcessTokenFacade,
                                        processModelFacade: IProcessModelFacade,
                                      ): Promise<NextFlowNodeInfo> {

    return this._executeHandler(onSuspendToken, processTokenFacade, processModelFacade);
  }

  protected async _executeHandler(token: Runtime.Types.ProcessToken,
                                  processTokenFacade: IProcessTokenFacade,
                                  processModelFacade: IProcessModelFacade): Promise<NextFlowNodeInfo> {

    const handlerPromise: Bluebird<any> = new Bluebird<any>(async(resolve: Function, reject: Function): Promise<void> => {

      const signalSubscriptionPromise: Bluebird<SignalEventReachedMessage> = this._waitForSignal();

      this.onInterruptedCallback = (interruptionToken: Runtime.Types.ProcessToken): void => {

        processTokenFacade.addResultForFlowNode(this.signalCatchEvent.id, interruptionToken);

        if (this.subscription) {
          this.subscription.dispose();
        }

        signalSubscriptionPromise.cancel();
        handlerPromise.cancel();

        return;
      };

      const receivedMessage: SignalEventReachedMessage = await signalSubscriptionPromise;

      token.payload = receivedMessage.currentToken;
      await this.persistOnResume(token);

      processTokenFacade.addResultForFlowNode(this.signalCatchEvent.id, receivedMessage.currentToken);
      await this.persistOnExit(token);

      const nextFlowNodeInfo: NextFlowNodeInfo = await this.getNextFlowNodeInfo(token, processTokenFacade, processModelFacade);

      return resolve(nextFlowNodeInfo);
    });

    return handlerPromise;
  }

  private _waitForSignal(): Bluebird<SignalEventReachedMessage> {

    return new Bluebird<SignalEventReachedMessage>((resolve: Function): void => {

      const signalEventName: string = eventAggregatorSettings.routePaths.signalEventReached
        .replace(eventAggregatorSettings.routeParams.signalReference, this.signalCatchEvent.signalEventDefinition.name);

      this.subscription = this._eventAggregator.subscribeOnce(signalEventName, async(signal: SignalEventReachedMessage) => {

        if (this.subscription) {
          this.subscription.dispose();
        }
        this.logger.verbose(
          `SignalCatchEvent instance ${this.flowNodeInstanceId} received signal ${signalEventName}:`,
          signal,
          'Resuming execution.',
        );

        return resolve(signal);
      });
      this.logger.verbose(`SignalCatchEvent instance ${this.flowNodeInstanceId} waiting for signal ${signalEventName}.`);
    });
  }
}
