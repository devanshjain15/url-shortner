import { Pool } from "pg";

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "urlshortener",
  user: "postgres",
  password: "1234",
});

export default pool;
