import express, { Request, Response, NextFunction } from "express";
import { createClient } from "redis";
import { body, validationResult } from "express-validator";
import { fileURLToPath } from "url";
import path from "path";
import createError from "http-errors";

import { generateShortCode } from "./utils";
import pool from "./db/conn";

const app = express();
const redisClient = createClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.post(
  "/shorten",
  [
    body("url")
      .trim() // Remove leading/trailing spaces
      .isURL({ require_protocol: true }) // Ensure it is a valid URL structure
      .withMessage("Please enter a valid URL including http:// or https://")
      .customSanitizer((value) => {
        // Basic URL normalization: lowercase host and remove trailing slash
        try {
          const url = new URL(value);
          url.hostname = url.hostname.toLowerCase();
          // remove trailing slash from pathname (but keep single "/")
          if (url.pathname !== "/" && url.pathname.endsWith("/")) {
            url.pathname = url.pathname.replace(/\/+$/, "");
          }
          return url.toString();
        } catch (e) {
          return value;
        }
      }),
  ],
  async (req: Request, res: Response) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      let body = "";
      errors.array().forEach((e) => (body += e.msg));
      return res.status(400).send(body);
    }
    let originalUrl = req.body.url;

    if (!originalUrl) {
      // TODO: make this beautiful
      res.status(400).send("<p>URL is required</p>");
      return;
    }

    let urlId: string;
    while (true) {
      urlId = generateShortCode();
      try {
        await pool.query(
          "INSERT INTO URLS (url_id, original_url) VALUES ($1, $2);",
          [urlId, originalUrl],
        );
        break;
      } catch (error: any) {
        if (error.code === "23505") continue;
        throw error;
      }
    }

    // 4. respond with HTML
    res.status(200).json({ urlId });
  },
);

app.get("/:urlId", async (req: Request, res: Response, next: NextFunction) => {
  let urlId = req.params.urlId;

  if (!urlId) return next(createError(404, "Invalid URL identifier"));

  urlId = urlId as string;

  console.log("Looking into cache");
  let originalUrl: string | null = await redisClient.get(urlId);

  if (!originalUrl) {
    console.log("cache miss :(");
    try {
      const result = await pool.query(
        `SELECT original_url FROM URLS WHERE url_id = $1;`,
        [urlId],
      );
      if (!result.rowCount) {
        // invalid url
        return next(createError(404, "Invalid URL identifier"));
      } else {
        // extract the stored original_url field
        originalUrl = result.rows[0].original_url as string;
        await redisClient.set(urlId, originalUrl, {
          expiration: { type: "EX", value: 60 }, // low value TTL because of testing in development
        });
      }
    } catch (error) {
      throw error;
    }
  } else {
    // cache hit
    console.log("cache hit :)");
  }
  // fire analytics
  pool
    .query("INSERT INTO CLICKS (url_id, ip_address) VALUES ($1, $2);", [
      urlId,
      req.ip,
    ])
    .catch((error) => console.error("Click tracking failed:", error));
  pool
    .query(
      "UPDATE URLS SET total_visits = total_visits + 1 WHERE url_id = $1;",
      [urlId],
    )
    .catch((error) => console.error("Click tracking failed:", error));
  return res.redirect(302, originalUrl as string);
});

app.get(
  "/stats/:urlId",
  async (req: Request, res: Response, next: NextFunction) => {
    const urlId = req.params.urlId;
    if (!urlId) return next(createError(404, "Invalid URL identifier"));

    try {
      // metadata about shorten url
      // distinct clicks
      // chart data clicks / day
      const [metadata, uniqueClicksData, perDayClicksData] = await Promise.all([
        pool.query(
          "SELECT original_url, total_visits, created_at FROM urls WHERE url_id = $1;",
          [urlId],
        ),
        pool.query(
          "SELECT COUNT(DISTINCT ip_address) FROM CLICKS WHERE url_id = $1;",
          [urlId],
        ),
        pool.query(
          "SELECT DATE(visited_at) as date, COUNT(*) as clicks FROM CLICKS WHERE url_id = $1 GROUP BY DATE(visited_at) order by date asc;",
          [urlId],
        ),
      ]);

      return res.status(200).json({
        metadata: metadata.rows[0],
        uniqueClicksData: uniqueClicksData.rows[0],
        perDayClicksData: perDayClicksData.rows,
      });
    } catch (error) {
      throw error;
    }
  },
);

app.get("/stats/:urlId/view", (req, res) => {
  const urlId = req.params.urlId;
  res.sendFile(path.join(PUBLIC_DIR, "stats.html"));
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";

  // if the request expects JSON, return JSON
  if (req.accepts("json") && !req.accepts("html")) {
    return res.status(status).json({ success: false, status, message });
  }

  // otherwise redirect to error page
  res.redirect(
    `/error.html?status=${status}&message=${encodeURIComponent(message)}`,
  );
});

async function main() {
  await redisClient.connect();
  app.listen(8000, () => {
    console.log(`Server is up at http://localhost:8000`);
  });
}

main();
