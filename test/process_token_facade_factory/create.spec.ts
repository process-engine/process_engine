/* eslint-disable dot-notation */
import * as should from 'should';

import {IIdentity} from '@essential-projects/iam_contracts';

import {ProcessTokenFacadeFactory} from '../../src/runtime/facades/process_token_facade_factory';
import {ProcessTokenFacade} from '../../src/runtime/facades/process_token_facade';
import {TestFixtureProvider} from '../test_fixture_provider';

describe('processTokenFacadeFactory.create', (): void => {

  let fixtureProvider: TestFixtureProvider;
  let processTokenFacadeFactory: ProcessTokenFacadeFactory;

  const processInstanceId = 'sampleProcessInstanceId';
  const processModelId = 'sampleProcessModelId';
  const correlationId = 'sampleCorrelationId';
  const identity: IIdentity = {
    userId: 'sampleUser',
    token: 'sampleToken',
  };

  before(async (): Promise<void> => {
    fixtureProvider = new TestFixtureProvider();
    await fixtureProvider.initialize();

    processTokenFacadeFactory = new ProcessTokenFacadeFactory();
  });

  it('Should create a new instance of a ProcessTokenFacade, using the provided ProcessModel as a baseline', (): void => {

    const processTokenFacade = processTokenFacadeFactory.create(processInstanceId, processModelId, correlationId, identity);

    should(processTokenFacade).be.instanceOf(ProcessTokenFacade);
    // These properties are only used internally, so we must use this type of notation to assert that they was passed to the facade correctly.
    should(processTokenFacade['processInstanceId']).be.equal(processInstanceId);
    should(processTokenFacade['processModelId']).be.equal(processModelId);
    should(processTokenFacade['correlationId']).be.equal(correlationId);
    should(processTokenFacade['identity']).be.eql(identity);
  });

  it('Should not throw an error, if no processInstanceId is provided', (): void => {
    try {
      processTokenFacadeFactory.create(undefined, processModelId, correlationId, identity);
    } catch (error) {
      should.fail(error, undefined, 'This should have succeeded.');
    }
  });

  it('Should not throw an error, if no processModelId is provided', (): void => {
    try {
      processTokenFacadeFactory.create(processInstanceId, undefined, correlationId, identity);
    } catch (error) {
      should.fail(error, undefined, 'This should have succeeded.');
    }
  });

  it('Should not throw an error, if no correlationId is provided', (): void => {
    try {
      processTokenFacadeFactory.create(processInstanceId, processModelId, undefined, identity);
    } catch (error) {
      should.fail(error, undefined, 'This should have succeeded.');
    }
  });

  it('Should not throw an error, if no identity is provided', (): void => {
    try {
      processTokenFacadeFactory.create(processInstanceId, processModelId, correlationId, undefined);
    } catch (error) {
      should.fail(error, undefined, 'This should have succeeded.');
    }
  });
});
