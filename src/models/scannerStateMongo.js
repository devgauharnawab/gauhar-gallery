import mongoose from 'mongoose';

const scannerStateSchema = new mongoose.Schema({
  _id: { type: String, default: 'scanner_1' },
  status: { type: String, enum: ['idle', 'scanning', 'completed', 'cancelled', 'failed'], default: 'idle' },
  currentDirectory: { type: String, default: '' },
  scannedFiles: { type: Number, default: 0 },
  imagesFound: { type: Number, default: 0 },
  errorsCount: { type: Number, default: 0 },
  startTime: { type: Date, default: null },
  endTime: { type: Date, default: null },
  lastError: { type: String, default: null }
}, {
  timestamps: true
});

export const MongoScannerState = mongoose.models.ScannerState || mongoose.model('ScannerState', scannerStateSchema);
