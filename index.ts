import { createServer } from '@graphql-yoga/node';
import {
  getPGBuilder,
  PrismaTypes,
  getPGPrismaConverter,
  dmmf,
} from '@planet-graphql/core';
import { PrismaClient } from '@prisma/client';

const pg = getPGBuilder<{ Prisma: PrismaTypes }>();
const pgpc = getPGPrismaConverter(pg, dmmf);
const { objects } = pgpc.convertTypes();
const { args } = pgpc.convertBuilders();

// PrismaClientの作成
const prisma = new PrismaClient({ log: ['query'] });
const usersQuery = pg.query({
  name: 'users',
  field: (b) => {
    return b
      .object(() => objects.User)
      .list()
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

// GraphQLサーバの起動
const server = createServer({
  schema: pg.build([usersQuery]),
  maskedErrors: false,
});

server.start();
