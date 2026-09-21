# Browser OCR assets

These files are served by the app so screenshot recognition runs on the device.
Screenshots are not sent to an external OCR service.

- `worker.min.js`: tesseract.js 7.0.0 (Apache-2.0).
- `tesseract-core-*-lstm.wasm.js`: tesseract.js-core 7.0.0 (Apache-2.0).
  Includes standard, SIMD and relaxed SIMD builds for browser compatibility.
- `eng.traineddata.gz`: @tesseract.js-data/eng 1.0.0,
  `4.0.0_best_int` English LSTM data (Apache-2.0).

The worker and core versions must match the installed tesseract.js version.
The scan uses the original screenshot; only the compressed copy is saved to
the QC draft. Results must have one explicit six-digit Job/Work Order label
and adequate OCR confidence. Ambiguous results use manual job-number entry.
