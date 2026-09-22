import {
  documentRoute,
  type DocumentStore,
} from "../../src/server/documents.ts";
import { HttpError } from "../../src/server/http.ts";

// Local runtime test only: no credentials, network services, or persistent data.
export default {
  async fetch(request: Request) {
    let reservations = 0,
      writes = 0,
      commits = 0;
    const hash = request.headers.get("x-test-approved-hash")!;
    const unexpected = async (): Promise<never> => {
      throw new Error("Unexpected store call");
    };
    const store: DocumentStore = {
      admitStorageOperation: async () => {},
      findUpload: async () => undefined,
      usage: async () => ({
        uploads: 0,
        answers: 0,
        storedBytes: 0,
        processedPages: 0,
      }),
      reserveUpload: async () => {
        reservations++;
        return undefined;
      },
      commitUpload: async (document) => {
        commits++;
        return document;
      },
      releaseUpload: unexpected,
      storageSnapshot: unexpected,
      getDocument: unexpected,
      listDocuments: unexpected,
      setDocumentTrashed: unexpected,
    };
    try {
      return (
        (await documentRoute(
          request,
          "test-owner",
          {
            store,
            approvedHashes: [hash],
            blobs: {
              put: async () => {
                writes++;
              },
              get: unexpected,
              delete: unexpected,
            },
          },
          async () => true,
          0,
        )) ?? new Response("Not found", { status: 404 })
      );
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "unknown",
          reservations,
          writes,
          commits,
        },
        {
          status: error instanceof HttpError ? error.status : 500,
        },
      );
    }
  },
};
