import * as should from 'should';

import {TestFixtureProvider} from '../test_fixture_provider';

describe('ProcessModelFacade.getUserTasks', (): void => {

  let fixtureProvider: TestFixtureProvider;

  before(async (): Promise<void> => {
    fixtureProvider = new TestFixtureProvider();
    await fixtureProvider.initialize();
  });

  it('should return one UserTask for a ProcessModel that only has one.', async (): Promise<void> => {

    const processModelFilePath = './test/bpmns/user_task_test.bpmn';
    const parsedProcessModel = await fixtureProvider.parseProcessModelFromFile(processModelFilePath);
    const processModelFacade = fixtureProvider.createProcessModelFacade(parsedProcessModel);

    const expectedUserTaskId = 'user_task_1';

    const userTasks = processModelFacade.getUserTasks();

    should(userTasks).be.instanceOf(Array);
    should(userTasks.length).be.equal(1);
    should(userTasks[0].id).be.equal(expectedUserTaskId);
  });

  it('should return all UserTasks from a ProcessModel with multiple UserTasks.', async (): Promise<void> => {

    const processModelFilePath = './test/bpmns/user_task_multiple.bpmn';
    const parsedProcessModel = await fixtureProvider.parseProcessModelFromFile(processModelFilePath);
    const processModelFacade = fixtureProvider.createProcessModelFacade(parsedProcessModel);

    const expectedUserTaskIds = [
      'Task_004be4s',
      'Task_1xcmvjs',
    ];

    const userTasks = processModelFacade.getUserTasks();

    should(userTasks).be.instanceOf(Array);
    should(userTasks.length).be.equal(2);

    for (const userTask of userTasks) {
      should(expectedUserTaskIds).containEql(userTask.id);
    }
  });

  it('should return an empty Array for a ProcessModel that has no UserTasks.', async (): Promise<void> => {

    const processModelFilePath = './test/bpmns/generic_sample.bpmn';
    const parsedProcessModel = await fixtureProvider.parseProcessModelFromFile(processModelFilePath);
    const processModelFacade = fixtureProvider.createProcessModelFacade(parsedProcessModel);

    const userTasks = processModelFacade.getUserTasks();

    should(userTasks).be.instanceOf(Array);
    should(userTasks.length).be.equal(0);
  });
});