import { WAL_AMPLIFICATION } from "./wal-amplification.ts";
import { CRASH_WORKLOAD } from "./crash-workload.ts";
import { type Module } from "../../../src/types.ts";
import { COMMIT_WORKLOAD } from "./commit-workload.ts";
import { WAL_RECORDS } from "./wal-records.ts";
import { WAL_PAGE_IMAGES } from "./wal-page-images.ts";
import { ARCHIVE_WORKLOAD } from "./archive-workload.ts";

export const WAL: Module = {
  category: "wal",
  title: "The write-ahead log: records, durability, crash redo",
  lessons: [
    WAL_RECORDS,
    WAL_PAGE_IMAGES,

    COMMIT_WORKLOAD,

    ARCHIVE_WORKLOAD,

    CRASH_WORKLOAD,

    WAL_AMPLIFICATION,
  ],
};
