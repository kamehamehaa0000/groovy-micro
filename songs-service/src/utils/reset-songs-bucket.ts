import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import r2Client from '../config/cloudflareR2'

export async function emptyBucket(bucketName: string): Promise<number> {
  let continuationToken: string | undefined
  let totalDeleted = 0

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    })

    const listResponse = await r2Client.send(listCommand)
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      break
    }

    const objectsToDelete = listResponse.Contents.map(obj => ({
      Key: obj.Key!,
    }))

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: objectsToDelete,
      },
    })

    const deleteResponse = await r2Client.send(deleteCommand)
    totalDeleted += deleteResponse.Deleted?.length || 0
    
    console.log(`Deleted ${deleteResponse.Deleted?.length || 0} objects`)

    continuationToken = listResponse.NextContinuationToken
  } while (continuationToken)

  return totalDeleted
}

export async function deleteBucketContents(prefix?: string): Promise<void> {
  const bucketName = process.env.R2_BUCKET_NAME!
  
  if (prefix) {
    // Delete only objects with specific prefix
    await deleteObjectsWithPrefix(bucketName, prefix)
  } else {
    // Delete everything
    const deletedCount = await emptyBucket(bucketName)
    console.log(`Deleted ${deletedCount} objects from bucket`)
  }
}

async function deleteObjectsWithPrefix(bucketName: string, prefix: string): Promise<void> {
  let continuationToken: string | undefined
  
  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    })

    const listResponse = await r2Client.send(listCommand)
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      break
    }

    const objectsToDelete = listResponse.Contents.map(obj => ({
      Key: obj.Key!,
    }))

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: objectsToDelete,
      },
    })

    await r2Client.send(deleteCommand)
    console.log(`Deleted ${objectsToDelete.length} objects with prefix: ${prefix}`)

    continuationToken = listResponse.NextContinuationToken
  } while (continuationToken)
}