import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const R2_CONFIG = {
  endpoint: "https://d7c94b29a462315ba2a012685c9c5b28.r2.cloudflarestorage.com",
  region: "auto",
  credentials: {
    accessKeyId: "b0442d58381e220d1df9041148dd1421",
    secretAccessKey: "b10ec224cd2e67471bcfa65ff55e8192e4e6fb3585d1c85194d4db4b5617a099",
  },
};

const BUCKET_NAME = "images";
const PUBLIC_URL_BASE = "https://pub-624c1856794d494b96d7182115490cb3.r2.dev";

const s3Client = new S3Client(R2_CONFIG);

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

export async function deleteFromR2(fileName: string): Promise<void> {
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    });
    await s3Client.send(deleteCommand);
  } catch (e: any) {
    // Ignore delete errors
  }
}

export async function clearR2Prefix(prefix: string): Promise<{ success: boolean; error?: string }> {
  try {
    let isTruncated = true;
    let continuationToken: string | undefined;
    let deletedCount = 0;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(listCommand);

      if (response.Contents && response.Contents.length > 0) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            await deleteFromR2(obj.Key);
            deletedCount++;
          }
        }
      }

      isTruncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function clearAllR2(): Promise<{ success: boolean; error?: string; deletedCount?: number }> {
  try {
    let isTruncated = true;
    let continuationToken: string | undefined;
    let deletedCount = 0;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(listCommand);

      if (response.Contents && response.Contents.length > 0) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            await deleteFromR2(obj.Key);
            deletedCount++;
          }
        }
      }

      isTruncated = response.IsTruncated || false;
      continuationToken = response.NextContinuationToken;
    }

    return { success: true, deletedCount };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function uploadToR2(
  filePath: string,
  fileName: string
): Promise<UploadResult> {
  try {
    await deleteFromR2(fileName);

    const { fs } = await import("../../lib/cep/node");

    const fileBuffer = fs.readFileSync(filePath);

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: "image/png",
    });

    await s3Client.send(command);

    const publicUrl = `${PUBLIC_URL_BASE}/${fileName}`;

    return { success: true, url: publicUrl };
  } catch (e: any) {
    return { success: false, error: e.message || "Upload failed" };
  }
}
