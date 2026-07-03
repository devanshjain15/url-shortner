import { Pool } from "pg";

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "urlshortener",
  user: "postgres",
  password: "password",
});

export default pool;
