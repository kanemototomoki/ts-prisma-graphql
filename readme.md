## 概要

https://zenn.dev/dekimasoon/articles/31f4a740f670af を進めたもの

## コマンド

### APIサーバ起動
```sh
npm start
```

### seed
```sh
npm run db:seed
```

## 出てくる単語とか

### Prisma
- https://www.prisma.io/
- Node.js ORM

### GraphQL
- WebAPIの規格の一つ
- REST APIの問題点を解決したもの
  - RESTの場合は必要ないデータも取得してしまう
  - 目的のデータを取得するために複数回リクエストする必要がある
- GraphQLは最小限のデータのみを取得できる
- **REST APIでもBFFなどを使えば上記のデメリットは解決できるので、GraphQLが上位互換とは一概には言えない？**
