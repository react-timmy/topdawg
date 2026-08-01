package expo.modules.filmsortsafcopy

import android.net.Uri
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream

/**
 * Streams bytes between file:// and content:// URIs (including SAF documents)
 * with a fixed buffer so multi‑GB videos never land on the JS heap.
 *
 * Expo's JS File APIs (bytes / base64 / open) OOM or reject SAF destinations;
 * native ContentResolver InputStream → OutputStream is the correct path.
 */
class FilmsortSafCopyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FilmsortSafCopy")

    /**
     * Copy [fromUri] → [toUri] using a 256 KiB buffer.
     * @return total bytes written
     */
    AsyncFunction("copyUriStreaming") { fromUri: String, toUri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val resolver = context.contentResolver

      val from = Uri.parse(fromUri)
      val to = Uri.parse(toUri)

      openInput(from, fromUri).use { rawIn ->
        BufferedInputStream(rawIn, BUFFER).use { input ->
          openOutput(resolver, to, toUri).use { rawOut ->
            BufferedOutputStream(rawOut, BUFFER).use { output ->
              val buf = ByteArray(BUFFER)
              var total = 0L
              while (true) {
                val n = input.read(buf)
                if (n < 0) break
                output.write(buf, 0, n)
                total += n
              }
              output.flush()
              // Double is what JS expects from Kotlin Long in some bridges;
              // return as Double for Expo number interop.
              total.toDouble()
            }
          }
        }
      }
    }
  }

  private fun openInput(uri: Uri, raw: String): InputStream {
    return when (uri.scheme) {
      "file" -> {
        val path = uri.path ?: throw Exception("Invalid file URI: $raw")
        FileInputStream(File(path))
      }
      "content", "android.resource" -> {
        val ctx = appContext.reactContext ?: throw Exceptions.ReactContextLost()
        ctx.contentResolver.openInputStream(uri)
          ?: throw Exception("Cannot open input stream: $raw")
      }
      else -> {
        // Some MediaLibrary paths look like content without scheme quirks
        val ctx = appContext.reactContext ?: throw Exceptions.ReactContextLost()
        ctx.contentResolver.openInputStream(uri)
          ?: throw Exception("Unsupported source scheme '${uri.scheme}': $raw")
      }
    }
  }

  private fun openOutput(
    resolver: android.content.ContentResolver,
    uri: Uri,
    raw: String,
  ): OutputStream {
    return when (uri.scheme) {
      "file" -> {
        val path = uri.path ?: throw Exception("Invalid file URI: $raw")
        val file = File(path)
        file.parentFile?.mkdirs()
        FileOutputStream(file)
      }
      "content" -> {
        // "wt" truncates existing SAF document created via createFileAsync (API 26+)
        val stream =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            resolver.openOutputStream(uri, "wt") ?: resolver.openOutputStream(uri)
          } else {
            resolver.openOutputStream(uri)
          }
        stream ?: throw Exception("Cannot open output stream: $raw")
      }
      else -> {
        resolver.openOutputStream(uri)
          ?: throw Exception("Unsupported destination scheme '${uri.scheme}': $raw")
      }
    }
  }

  companion object {
    /** 256 KiB — sweet spot for bulk media without ballooning RAM */
    private const val BUFFER = 256 * 1024
  }
}
