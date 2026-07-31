import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PG } from './db/db.module';

describe('AppController', () => {
  let appController: AppController;
  const pgMock = jest.fn(() => [{ now: new Date('2026-01-01T00:00:00Z') }]);

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PG, useValue: pgMock }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('reports ok with the DB timestamp', async () => {
      await expect(appController.health()).resolves.toEqual({
        status: 'ok',
        dbTime: new Date('2026-01-01T00:00:00Z'),
      });
    });
  });
});
