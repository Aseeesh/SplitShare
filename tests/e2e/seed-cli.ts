import { seed } from "./seed";

const url = process.env.E2E_DATABASE_URL;
if (!url) {
  console.error("E2E_DATABASE_URL is required (a throwaway database; it is wiped).");
  process.exit(1);
}
seed(url).then(
  () => console.log("e2e database seeded"),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
