import si from 'systeminformation';
import { logger } from './logger.js';

/**
 * Collects comprehensive system information including CPU, memory, OS, and graphics data.
 * This matches the data format expected by the Dashcam backend (same as desktop app).
 * 
 * @returns {Promise<Object>} System information object
 */
export async function getSystemInfo() {
  try {
    logger.debug('Collecting system information...');
    
    // Collect only essential system information quickly
    // Graphics info can be very slow, so we skip it or use a short timeout
    const [cpu, mem, osInfo, system] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.osInfo(),
      si.system()
    ]);
    
    // Try to get graphics info with a very short timeout (optional)
    let graphics = { controllers: [], displays: [] };
    try {
      graphics = await Promise.race([
        si.graphics(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Graphics timeout')), 2000))
      ]);
    } catch (error) {
      logger.debug('Graphics info timed out, using empty graphics data');
    }

    const systemInfo = {
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        vendor: cpu.vendor,
        family: cpu.family,
        model: cpu.model,
        stepping: cpu.stepping,
        revision: cpu.revision,
        voltage: cpu.voltage,
        speed: cpu.speed,
        speedMin: cpu.speedMin,
        speedMax: cpu.speedMax,
        cores: cpu.cores,
        physicalCores: cpu.physicalCores,
        processors: cpu.processors,
        socket: cpu.socket,
        cache: cpu.cache
      },
      mem: {
        total: mem.total,
        free: mem.free,
        used: mem.used,
        active: mem.active,
        available: mem.available,
        swaptotal: mem.swaptotal,
        swapused: mem.swapused,
        swapfree: mem.swapfree
      },
      os: {
        platform: osInfo.platform,
        distro: osInfo.distro,
        release: osInfo.release,
        codename: osInfo.codename,
        kernel: osInfo.kernel,
        arch: osInfo.arch,
        hostname: osInfo.hostname,
        fqdn: osInfo.fqdn,
        codepage: osInfo.codepage,
        logofile: osInfo.logofile,
        build: osInfo.build,
        servicepack: osInfo.servicepack,
        uefi: osInfo.uefi
      },
      graphics: {
        controllers: graphics.controllers?.map(controller => ({
          vendor: controller.vendor,
          model: controller.model,
          bus: controller.bus,
          vram: controller.vram,
          vramDynamic: controller.vramDynamic
        })),
        displays: graphics.displays?.map(display => ({
          vendor: display.vendor,
          model: display.model,
          main: display.main,
          builtin: display.builtin,
          connection: display.connection,
          resolutionX: display.resolutionX,
          resolutionY: display.resolutionY,
          sizeX: display.sizeX,
          sizeY: display.sizeY,
          pixelDepth: display.pixelDepth,
          currentResX: display.currentResX,
          currentResY: display.currentResY,
          currentRefreshRate: display.currentRefreshRate
        }))
      },
      system: {
        manufacturer: system.manufacturer,
        model: system.model,
        version: system.version,
        serial: system.serial,
        uuid: system.uuid,
        sku: system.sku,
        virtual: system.virtual
      }
    };

    logger.verbose('System information collected', {
      cpuBrand: cpu.brand,
      totalMemoryGB: (mem.total / (1024 * 1024 * 1024)).toFixed(2),
      os: `${osInfo.distro} ${osInfo.release}`,
      graphicsControllers: graphics.controllers?.length || 0,
      displays: graphics.displays?.length || 0
    });

    return systemInfo;
  } catch (error) {
    logger.error('Failed to collect system information:', {
      message: error.message,
      stack: error.stack
    });
    
    // Return minimal system info as fallback
    return {
      cpu: { brand: 'Unknown', cores: 0 },
      mem: { total: 0 },
      os: { 
        platform: process.platform,
        arch: process.arch,
        release: process.version
      },
      graphics: { controllers: [], displays: [] },
      system: { manufacturer: 'Unknown', model: 'Unknown' }
    };
  }
}
