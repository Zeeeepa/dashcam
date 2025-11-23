# Performance Tracking

The Dashcam CLI now includes comprehensive performance tracking during recordings. This feature monitors CPU and memory usage throughout the recording session and includes the data in the log files.

## What's Tracked

### 1. Dashcam Process Metrics
- **CPU Usage**: Percentage of CPU used by the Dashcam process
- **Memory Usage**: Memory consumed by the Dashcam process in bytes and MB
- **Process Info**: PID, parent PID, CPU time, elapsed time

### 2. System-Wide Metrics
- **Total Memory**: System total and free memory
- **Memory Usage Percentage**: Overall system memory utilization
- **CPU Count**: Number of CPU cores available

### 3. Top Processes
- **Top 10 by CPU**: The most CPU-intensive processes running on the system
- **Top 10 by Memory**: The most memory-intensive processes running on the system
- **Process Details**: For each top process, tracks:
  - Process name
  - PID
  - CPU usage percentage
  - Memory usage in bytes
  - Parent process ID
  - CPU time and elapsed time

## Sampling Frequency

Performance metrics are sampled every **1 second** (1000ms) during the recording session.

## Output Format

Performance data is included in the recording result with the following structure:

```javascript
{
  performance: {
    samples: [
      {
        timestamp: 1700000000000,
        elapsedMs: 1000,
        system: {
          totalMemory: 17179869184,
          freeMemory: 8589934592,
          usedMemory: 8589934592,
          memoryUsagePercent: 50.0,
          cpuCount: 8
        },
        process: {
          cpu: 15.5,
          memory: 134217728,
          pid: 12345,
          ppid: 1,
          ctime: 5000,
          elapsed: 10000
        },
        topProcesses: [
          {
            pid: 54321,
            name: "ffmpeg",
            cpu: 85.2,
            memory: 268435456,
            ppid: 12345,
            ctime: 8500,
            elapsed: 10000
          },
          // ... up to 10 processes
        ],
        totalProcesses: 342
      }
      // ... one sample per second
    ],
    summary: {
      durationMs: 10000,
      sampleCount: 10,
      monitorInterval: 1000,
      avgProcessCPU: 12.3,
      maxProcessCPU: 18.7,
      avgProcessMemoryBytes: 134217728,
      avgProcessMemoryMB: 128.0,
      maxProcessMemoryBytes: 201326592,
      maxProcessMemoryMB: 192.0,
      avgSystemMemoryUsagePercent: 52.5,
      maxSystemMemoryUsagePercent: 55.3,
      totalSystemMemoryBytes: 17179869184,
      totalSystemMemoryGB: 16.0
    }
  }
}
```

## Summary Statistics

The performance tracker calculates summary statistics including:
- **Average and Max Process CPU**: How much CPU the Dashcam process used
- **Average and Max Process Memory**: Memory consumed by the Dashcam process
- **Average and Max System Memory Usage**: Overall system memory pressure
- **Total Duration**: How long the tracking ran
- **Sample Count**: Number of samples collected

## Logging

Performance data is logged to the standard Dashcam log files:
- `~/.dashcam/logs/combined.log` - All log levels including performance samples
- `~/.dashcam/logs/debug.log` - Debug-level information
- Console output when running with `--verbose` flag

## Testing

Run the performance tracking test:

```bash
node test-performance-tracking.js
```

This will:
1. Start a 10-second recording
2. Collect performance samples every second
3. Display detailed performance statistics
4. Show the top 10 processes at the end of the recording

## Use Cases

Performance tracking helps with:
- **Debugging Performance Issues**: Identify when recordings are resource-intensive
- **Optimization**: Track the impact of code changes on resource usage
- **System Monitoring**: Understand what other processes are running during recordings
- **Troubleshooting**: Correlate performance issues with specific applications or system states
- **Capacity Planning**: Understand resource requirements for different recording scenarios

## Implementation Details

The performance tracker uses:
- `pidusage` - For detailed per-process CPU and memory statistics
- `ps-list` - For listing all system processes
- `os` module - For system-wide memory and CPU information

The tracker runs in parallel with the recording and has minimal overhead (~1% CPU on average).
