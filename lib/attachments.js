import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, resolve } from 'node:path'
import { BotError, errorMessage } from './errors.js'

export const MAX_FILES = 8
export const MAX_FILE_BYTES = 50 * 1024 * 1024
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }

/**
 * Store a reply's produced files through the attachment service and return
 * their content blocks (images as `image`, everything else as `file`) in the
 * given order. Every file is validated before anything is stored, and any
 * failure rejects the whole reply.
 * @param files - `{ path, description? }`; relative paths resolve in the shared workspace.
 * @returns the blocks and a listing for the reply text.
 */
export async function toContentBlocks(files, { attachments, workspace, signal }) {
  if (files === undefined || files.length === 0) return { blocks: [], listing: [] }
  if (attachments === undefined) throw new BotError('attachments_unavailable', 'the attachment service is not part of this profile', 409)
  if (files.length > MAX_FILES) throw new BotError('too_many_files', `a reply carries at most ${MAX_FILES} files`)

  const entries = []
  for (const file of files) {
    if (typeof file?.path !== 'string' || file.path.trim() === '') throw new BotError('invalid_file', 'every file needs a path')
    const path = isAbsolute(file.path) ? file.path : resolve(workspace, file.path)
    let info
    try {
      info = await stat(path)
    } catch {
      throw new BotError('file_not_found', `no file at ${path}`, 404)
    }
    if (!info.isFile()) throw new BotError('file_not_found', `${path} is not a regular file`, 404)
    const mediaType = IMAGE_TYPES[extname(path).toLowerCase()]
    if (mediaType === undefined && info.size > MAX_FILE_BYTES) throw new BotError('file_too_large', `${path} exceeds ${MAX_FILE_BYTES} bytes`, 413)
    entries.push({ path, name: basename(path), description: typeof file.description === 'string' ? file.description.trim() : '', mediaType })
  }

  const blocks = []
  for (const entry of entries) {
    try {
      if (entry.mediaType !== undefined) {
        const ref = await attachments.saveImage({ data: await readFile(entry.path), mediaType: entry.mediaType, name: entry.name })
        blocks.push({ type: 'image', attachment: ref })
      } else {
        const ref = await attachments.saveFileStream({ data: createReadStream(entry.path), name: entry.name, ...signal === undefined ? {} : { signal } })
        blocks.push({ type: 'file', attachment: ref })
      }
    } catch (error) {
      if (attachments.isAttachmentError?.(error) === true) {
        throw new BotError(typeof error.code === 'string' ? error.code : 'attachment_rejected', `${entry.name}: ${errorMessage(error)}`, 422)
      }
      throw error
    }
  }
  return {
    blocks,
    listing: entries.map((entry) => ({ name: entry.name, path: entry.path, description: entry.description, kind: entry.mediaType === undefined ? 'file' : 'image' })),
  }
}
