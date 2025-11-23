# Linux Performance Tracking Fixes

## Problem
Performance data from dashcam-cli-minimal was not working on Ubuntu Linux.

## Root Causes Identified

### 1. **ps command compatibility**
- Some Linux distributions (especially minimal/container images) use BusyBox `ps` which doesn't support the `--sort` option
- The code was failing when trying to use `ps --sort=-pcpu`

### 2. **Missing error handling**
- Insufficient logging made it hard to diagnose where the performance tracking was failing
- No fallback mechanisms when certain system calls failed

### 3. **Network metrics parsing**
- The macOS netstat parsing had an off-by-one error in the parts length check
- Could cause network metrics to fail silently

### 4. **Import optimization**
- The Linux network code was using `await import('fs')` dynamically when `fs` was already imported at the top

## Fixes Applied

### topProcesses.js
1. **Added fallback for ps --sort**:
   ```javascript
   try {
     // Try with --sort first
     const result = await execFileAsync('ps', ['-eo', 'pid,pcpu,pmem,comm', '--sort=-pcpu'], ...);
   } catch (sortError) {
     // Fallback to unsorted and sort in JavaScript
     const result = await execFileAsync('ps', ['-eo', 'pid,pcpu,pmem,comm'], ...);
   }
   ```

2. **Improved parsing with filtering**:
   - Now filters out invalid entries (pid <= 0)
   - Handles missing/undefined CPU and memory values
   - Always sorts by CPU in JavaScript as a backup

3. **Added timeouts**:
   - All process listings now have 5-10 second timeouts to prevent hanging

### performanceTracker.js
1. **Fixed network metrics**:
   - Corrected macOS netstat parsing (parts.length >= 10 instead of >= 7)
   - Removed redundant `await import('fs')` on Linux
   - Already using `fs` from the top-level import

2. **Enhanced error handling**:
   - All metric collection methods now have comprehensive try/catch blocks
   - Graceful degradation - if one metric fails, others continue
   - Better logging with platform and error context

3. **Improved logging**:
   - Added debug logs for successful operations
   - More detailed error messages including platform info
   - Stack traces for debugging

## Testing

### Quick Test (10 seconds)
```bash
cd dashcam-cli-minimal
node test-perf-linux.js
```

This will:
- Test `pidusage` library
- Test `getTopProcesses` function
- Test network metrics reading
- Test system metrics
- Run full performance tracker for 10 seconds
- Show detailed results and identify any failures

### Full Recording Test
```bash
# Start a recording with performance tracking
dashcam start

# Do some work for 10-15 seconds
# ...

# Stop recording  
dashcam stop

# Check the output for performance data
```

### Expected Output
The test should show:
```
✓ pidusage: PASS
✓ topProcesses: PASS  
✓ networkMetrics: PASS
✓ systemMetrics: PASS
✓ performanceTracker: PASS

Overall: ✓ ALL TESTS PASSED
```

## Platform-Specific Notes

### Ubuntu/Debian
- Should work on all versions
- Uses `/proc/net/dev` for network stats
- Falls back if `ps --sort` not available

### Alpine Linux / Docker
- BusyBox `ps` detected automatically
- Sorts processes in JavaScript instead
- May have limited network stats in containers

### CentOS/RHEL
- Full GNU ps support
- Should use `--sort` option
- Full network stats available

## Troubleshooting

### If performance data is still empty:

1. **Check pidusage works**:
   ```bash
   node -e "import('pidusage').then(m => m.default(process.pid).then(console.log))"
   ```

2. **Check ps command**:
   ```bash
   ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -5
   # If this fails, try:
   ps -eo pid,pcpu,pmem,comm | head -5
   ```

3. **Check /proc/net/dev exists**:
   ```bash
   cat /proc/net/dev
   ```

4. **Run with verbose logging**:
   ```bash
   dashcam start --verbose
   # ... do work ...
   dashcam stop --verbose
   ```

5. **Check the performance file directly**:
   ```bash
   # Look for performance.jsonl in the output directory
   cat ~/.dashcam/recordings/*/performance.jsonl | head -1 | jq
   ```

## What Gets Tracked

Even with the fixes, the following is tracked every 5 seconds:

- ✅ Process CPU usage (dashcam process)
- ✅ Process memory usage (dashcam process)
- ✅ System-wide memory usage
- ✅ System CPU core count
- ✅ Top 10 processes by CPU
- ✅ Network I/O (where available)

## API Upload

The performance data is uploaded to the API with the recording:

```javascript
{
  performance: {
    samples: [...], // Array of samples taken during recording
    summary: {      // Aggregated statistics
      avgProcessCPU: 12.3,
      maxProcessCPU: 18.7,
      avgProcessMemoryMB: 128.0,
      maxProcessMemoryMB: 192.0,
      // ...
    }
  }
}
```

This data is then displayed in the web UI under the "Performance" tab.
