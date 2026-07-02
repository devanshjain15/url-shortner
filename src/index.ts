import express from "express";

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (req, res) => {});
app.post("/shorten", (req, res) => {});
app.get("/:urlId", (req, res) => {});

app.listen(8000, () => {
  console.log(`Server is up at http://localhost:8000`);
});
