import express, { Request, Response, NextFunction } from "express";
import { createClient } from "redis";
import { body, validationResult } from "express-validator";

import { generateShortCode } from "./utils";
import pool from "./db/conn";

const app = express();
const redisClient = createClient();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {});

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
      return res.status(400).json({ errors: errors.array() });
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
    res.send(`
    <p>Your short URL: 
      <a href="http://localhost:8000/${urlId}">
        http://localhost:8000/${urlId}
      </a>
    </p>
  `);
  },
);

app.get("/:urlId", async (req: Request, res: Response) => {});

app.use((req: Request, res: Response, next: NextFunction) => {
  //   add some static page no such url and go to home page link
  res.status(404).json({
    status: "fail",
    message: `Cannot find ${req.originalUrl} on this server!`,
  });
});

app.listen(8000, () => {
  console.log(`Server is up at http://localhost:8000`);
});
