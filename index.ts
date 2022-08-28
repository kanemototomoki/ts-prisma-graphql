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

// PrismaClientの作成
const prisma = new PrismaClient({ log: ['query'] });
const usersQuery = pg.query({
  name: 'users',
  field: (b) => {
    return b
      .object(() => objects.User)
      .list()
      .resolve(() => prisma.user.findMany());
  },
});

// GraphQLサーバの起動
const server = createServer({
  schema: pg.build([usersQuery]),
  maskedErrors: false,
});

server.start();
