import { NextRequest, NextResponse } from "next/server";

// Max file size: 10MB
const MAX_BYTES = 10 * 1024 * 1024;

// Max characters to inject into prompt (to stay within token limits)
const MAX_CONTEXT_CHARS = 40000;

type ParseResult = { text: string; meta: string };

async function parseExcel(buffer: Buffer, filename: string): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(ws);
    // Strip lines that are all commas (empty rows)
    const cleaned = csv
      .split("\n")
      .filter((line) => line.replace(/,/g, "").trim().length > 0)
      .join("\n");
    if (cleaned.trim()) {
      parts.push(`--- Sheet: ${sheetName} ---\n${cleaned}`);
    }
  }

  const text = parts.join("\n\n");
  const meta = `Excel file: ${filename} | ${wb.SheetNames.length} sheets: ${wb.SheetNames.join(", ")}`;
  return { text, meta };
}

async function parsePDF(buffer: Buffer, filename: string): Promise<ParseResult> {
  // Use dynamic import to avoid build-time issues
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return {
    text: result.text,
    meta: `PDF: ${filename} | ${result.numpages} pages`,
  };
}

async function parseWord(buffer: Buffer, filename: string): Promise<ParseResult> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return {
    text: result.value,
    meta: `Word document: ${filename}`,
  };
}

async function parseText(buffer: Buffer, filename: string): Promise<ParseResult> {
  const text = buffer.toString("utf-8");
  return {
    text,
    meta: `Text file: ${filename}`,
  };
}

async function parseCSV(buffer: Buffer, filename: string): Promise<ParseResult> {
  const text = buffer.toString("utf-8");
  return {
    text,
    meta: `CSV file: ${filename}`,
  };
}

async function parseJSON(buffer: Buffer, filename: string): Promise<ParseResult> {
  try {
    const json = JSON.parse(buffer.toString("utf-8"));
    const text = JSON.stringify(json, null, 2);
    return { text, meta: `JSON file: ${filename}` };
  } catch {
    return { text: buffer.toString("utf-8"), meta: `JSON file (invalid): ${filename}` };
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large (max 10MB, got ${(file.size / 1024 / 1024).toFixed(1)}MB)` }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";

    let result: ParseResult;

    if (["xlsx", "xls", "xlsm", "xlsb"].includes(ext)) {
      result = await parseExcel(buffer, filename);
    } else if (ext === "pdf") {
      result = await parsePDF(buffer, filename);
    } else if (["docx", "doc"].includes(ext)) {
      result = await parseWord(buffer, filename);
    } else if (ext === "csv") {
      result = await parseCSV(buffer, filename);
    } else if (ext === "json") {
      result = await parseJSON(buffer, filename);
    } else if (["txt", "md", "mdx", "rst", "log"].includes(ext)) {
      result = await parseText(buffer, filename);
    } else {
      // Try as plain text fallback
      try {
        result = await parseText(buffer, filename);
      } catch {
        return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 });
      }
    }

    // Trim to max context length
    const trimmed = result.text.length > MAX_CONTEXT_CHARS
      ? result.text.slice(0, MAX_CONTEXT_CHARS) + `\n\n[... เนื้อหาถูกตัดเนื่องจากไฟล์ใหญ่เกิน ${MAX_CONTEXT_CHARS.toLocaleString()} ตัวอักษร]`
      : result.text;

    return NextResponse.json({
      filename: file.name,
      size: file.size,
      meta: result.meta,
      context: trimmed,
      chars: trimmed.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
