import { createServer } from '@graphql-yoga/node';
import {
  getPGBuilder,
  PrismaTypes,
  getPGPrismaConverter,
  dmmf,
} from '@planet-graphql/core';
import { PrismaClient } from '@prisma/client';

type Context = {
  userId: number;
  isAdmin: boolean;
};
const pg = getPGBuilder<{ Context: Context; Prisma: PrismaTypes }>();
const pgpc = getPGPrismaConverter(pg, dmmf);
const user = pgpc.redefine({
  name: 'User',
  fields: (f, b) => ({
    ...f,
    taskCount: b.int(),
  }),
  relations: () => getRelations('User'),
});
const task = pgpc.redefine({
  name: 'Task',
  fields: (f) => {
    const { user, ...rest } = f;
    return { ...rest };
  },
  relations: () => getRelations('Task'),
});

user.implement((f) => ({
  taskCount: f.taskCount.resolve((params) => {
    return pg.dataloader(params, async (userList) => {
      const userIds = userList.map((x) => x.id);
      const resp = await prisma.task.groupBy({
        by: ['userId'],
        _count: { _all: true },
        where: { userId: { in: userIds } },
      });
      return userIds.map(
        (id) => resp.find((x) => x.userId === id)?._count._all ?? 0
      );
    });
  }),
}));

const { objects, getRelations } = pgpc.convertTypes({
  User: () => user,
  Task: () => task,
});
const { args } = pgpc.convertBuilders();

const taskEnum = pg.enum({
  name: 'TaskEnum',
  values: ['new', 'in_progress', 'done'],
});

const createTaskInput = pg
  .input({
    name: 'CreateTaskInput',
    fields: (b) => ({
      title: b.string().validation((schema) => schema.max(100)),
      content: b.string().nullable(),
      status: b.enum(taskEnum),
      dueAt: b.dateTime(),
    }),
  })
  .validation((value) => value.title.length > 0 || value.status !== 'new');

const createTaskMutation = pg.mutation({
  name: 'createTask',
  field: (b) =>
    b
      .object(() => task)
      .args((b) => ({
        input: b.input(() => createTaskInput),
      }))
      .resolve(({ context, args }) =>
        prisma.task.create({
          data: {
            ...args.input,
            userId: context.userId,
          },
        })
      ),
});

const updateTaskInput = createTaskInput.copy({
  name: 'UpdateTaskInput',
  fields: (f, b) => ({
    ...f,
    id: b.int(),
  }),
});

const updateTaskMutation = pg.mutation({
  name: 'updateTask',
  field: (b) =>
    b
      .object(() => task)
      .args((b) => ({
        input: b.input(() => updateTaskInput),
      }))
      .resolve(async ({ context, args }) => {
        await prisma.task.findFirstOrThrow({
          where: {
            id: args.input.id,
            userId: context.userId,
          },
        });
        return prisma.task.update({
          where: {
            id: args.input.id,
          },
          data: args.input,
        });
      }),
});

// PrismaClientの作成
const prisma = new PrismaClient({ log: ['query'] });
const usersQuery = pg.query({
  name: 'users',
  field: (b) => {
    return b
      .object(() => objects.User)
      .list()
      .auth(({ context }) => context.isAdmin, { strict: true })
      .prismaArgs(() =>
        args.findManyUser
          .edit((f) => ({
            where: f.where.edit((f) => ({
              email: f.email,
              tasks: f.tasks.edit((f) => ({
                some: f.some.edit((f) => ({
                  status: f.status
                    .select('String')
                    .validation((schema) =>
                      schema.regex(/new|in_progress|done/)
                    ),
                })),
              })),
            })),
          }))
          .build({ type: true })
      )
      .resolve(({ prismaArgs }) => prisma.user.findMany(prismaArgs));
  },
});

const tasksQuery = pg.query({
  name: 'tasks',
  field: (b) =>
    b
      .object(() => objects.Task)
      .relay()
      .relayOrderBy([{ updatedAt: 'desc' }, { id: 'desc' }])
      .relayArgs((f) => ({
        ...f,
        first: f.first.default(10).validation((schema) => schema.max(100)),
        last: f.last.validation((schema) => schema.max(100)),
      }))
      .relayTotalCount(({ context }) =>
        prisma.task.count({
          where: { userId: context.userId },
        })
      )
      .resolve(({ context, prismaArgs }) =>
        prisma.task.findMany({
          ...prismaArgs,
          where: { userId: context.userId },
        })
      ),
});

// GraphQLサーバの起動
const server = createServer({
  schema: pg.build([usersQuery, tasksQuery, createTaskMutation, updateTaskMutation]),
  maskedErrors: false,
  context: ({ req }) => ({
    userId: Number(req.headers['x-user-id'] ?? 0),
    isAdmin: Boolean(req.headers['x-is-admin'] ?? false),
  }),
});

server.start();
