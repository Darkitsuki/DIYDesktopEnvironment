import { Gtk } from "ags/gtk4"
import { createState } from "gnim"
import { execAsync } from "ags/process"
import GLib from "gi://GLib?version=2.0"

interface StatItem {
  text: string
  tooltip: string
  cssClass: string
}

// ----------------------------------------------------
// CPU Usage: /proc/stat delta
// ----------------------------------------------------
let prevIdle = 0
let prevTotal = 0

function readCpuStat(): { idle: number; total: number } | null {
  try {
    const [ok, bytes] = GLib.file_get_contents("/proc/stat")
    if (ok) {
      const line = new TextDecoder().decode(bytes).split("\n")[0]
      const parts = line.trim().split(/\s+/).slice(1).map(Number)
      if (parts.length >= 4) {
        const idle = parts[3] + (parts[4] || 0)
        const total = parts.reduce((acc, val) => acc + val, 0)
        return { idle, total }
      }
    }
  } catch {}
  return null
}

const initialCpuStat = readCpuStat()
if (initialCpuStat) {
  prevIdle = initialCpuStat.idle
  prevTotal = initialCpuStat.total
}

// ----------------------------------------------------
// RAM Usage: /proc/meminfo
// ----------------------------------------------------
function getRamUsage(): StatItem {
  try {
    const [ok, bytes] = GLib.file_get_contents("/proc/meminfo")
    if (ok) {
      const text = new TextDecoder().decode(bytes)
      let totalKb = 0
      let availKb = 0
      for (const line of text.split("\n")) {
        if (line.startsWith("MemTotal:")) {
          totalKb = parseInt(line.replace(/[^0-9]/g, ""), 10)
        } else if (line.startsWith("MemAvailable:")) {
          availKb = parseInt(line.replace(/[^0-9]/g, ""), 10)
        }
        if (totalKb > 0 && availKb > 0) break
      }
      if (totalKb > 0) {
        const usedKb = totalKb - availKb
        const percent = Math.round((usedKb / totalKb) * 100)
        const usedGiB = (usedKb / (1024 * 1024)).toFixed(1)
        const totalGiB = (totalKb / (1024 * 1024)).toFixed(1)
        const cssClass = percent >= 90 ? "critical" : percent >= 80 ? "warning" : "normal"
        return {
          text: `${percent}%`,
          tooltip: `RAM: ${usedGiB} / ${totalGiB} GiB (${percent}%)`,
          cssClass,
        }
      }
    }
  } catch (e) {
    console.error("RAM error:", e)
  }
  return { text: "--%", tooltip: "RAM: Unavailable", cssClass: "suspended" }
}

// ----------------------------------------------------
// CPU Temperature: hwmon coretemp/k10temp or thermal_zone
// ----------------------------------------------------
let cachedCpuTempPath: string | null = null

function getCpuTempPath(): string | null {
  if (cachedCpuTempPath && GLib.file_test(cachedCpuTempPath, GLib.FileTest.EXISTS)) {
    return cachedCpuTempPath
  }

  // 1. Scan hwmon for coretemp or k10temp
  for (let i = 0; i < 15; i++) {
    const namePath = `/sys/class/hwmon/hwmon${i}/name`
    if (GLib.file_test(namePath, GLib.FileTest.EXISTS)) {
      try {
        const [ok, bytes] = GLib.file_get_contents(namePath)
        if (ok) {
          const name = new TextDecoder().decode(bytes).trim()
          if (name === "coretemp" || name === "k10temp") {
            const tempFile = `/sys/class/hwmon/hwmon${i}/temp1_input`
            if (GLib.file_test(tempFile, GLib.FileTest.EXISTS)) {
              cachedCpuTempPath = tempFile
              return cachedCpuTempPath
            }
          }
        }
      } catch {}
    }
  }

  // 2. Scan thermal_zone for x86_pkg_temp, coretemp, k10temp, acpitz
  for (let i = 0; i < 10; i++) {
    const typePath = `/sys/class/thermal/thermal_zone${i}/type`
    if (GLib.file_test(typePath, GLib.FileTest.EXISTS)) {
      try {
        const [ok, bytes] = GLib.file_get_contents(typePath)
        if (ok) {
          const type = new TextDecoder().decode(bytes).trim().toLowerCase()
          if (
            type.includes("x86_pkg_temp") ||
            type.includes("coretemp") ||
            type.includes("k10temp") ||
            type.includes("acpitz")
          ) {
            const tempFile = `/sys/class/thermal/thermal_zone${i}/temp`
            if (GLib.file_test(tempFile, GLib.FileTest.EXISTS)) {
              cachedCpuTempPath = tempFile
              return cachedCpuTempPath
            }
          }
        }
      } catch {}
    }
  }

  return null
}

function getCpuTemp(): StatItem {
  try {
    const path = getCpuTempPath()
    if (path) {
      const [ok, bytes] = GLib.file_get_contents(path)
      if (ok) {
        const raw = parseInt(new TextDecoder().decode(bytes).trim(), 10)
        const tempC = raw > 1000 ? Math.round(raw / 1000) : raw
        const cssClass = tempC >= 88 ? "critical" : tempC >= 75 ? "warning" : "normal"
        return {
          text: `${tempC}°C`,
          tooltip: `CPU Temp: ${tempC}°C`,
          cssClass,
        }
      }
    }
  } catch (e) {
    console.error("CPU Temp error:", e)
  }
  return { text: "--°C", tooltip: "CPU Temp: Unavailable", cssClass: "suspended" }
}

// ----------------------------------------------------
// GPU Temperature: waybar-gpu-temp (D3cold safe)
// ----------------------------------------------------
async function getGpuTemp(): Promise<StatItem> {
  try {
    const out = await execAsync(["/home/your-username/.local/bin/waybar-gpu-temp"])
    const data = JSON.parse(out.trim())
    return {
      text: (data.text || "--°C").trim(),
      cssClass: data.class || "normal",
      tooltip: data.tooltip || "GPU",
    }
  } catch (e) {
    return {
      text: "--°C",
      cssClass: "suspended",
      tooltip: "NVIDIA GPU: Unavailable",
    }
  }
}

export default function SystemStats() {
  const [cpu, setCpu] = createState<StatItem>({
    text: "0%",
    tooltip: "CPU Usage",
    cssClass: "normal",
  })
  const [ram, setRam] = createState<StatItem>(getRamUsage())
  const [cpuTemp, setCpuTemp] = createState<StatItem>(getCpuTemp())
  const [gpuTemp, setGpuTemp] = createState<StatItem>({
    text: "--°C",
    tooltip: "NVIDIA GPU",
    cssClass: "suspended",
  })

  // Poll CPU Usage every 2500ms
  const updateCpu = () => {
    const stat = readCpuStat()
    if (stat) {
      const deltaIdle = stat.idle - prevIdle
      const deltaTotal = stat.total - prevTotal
      prevIdle = stat.idle
      prevTotal = stat.total

      if (deltaTotal > 0) {
        const usage = Math.max(0, Math.min(100, Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 100)))
        const cssClass = usage >= 90 ? "critical" : usage >= 75 ? "warning" : "normal"
        setCpu({
          text: `${usage}%`,
          tooltip: `CPU Usage: ${usage}%`,
          cssClass,
        })
      }
    }
  }
  setTimeout(updateCpu, 500)
  setInterval(updateCpu, 2500)

  // Poll RAM Usage every 3000ms
  setInterval(() => {
    setRam(getRamUsage())
  }, 3000)

  // Poll CPU Temp every 3000ms
  setInterval(() => {
    setCpuTemp(getCpuTemp())
  }, 3000)

  // Poll GPU Temp every 3000ms
  const updateGpu = () => {
    getGpuTemp().then(setGpuTemp)
  }
  updateGpu()
  setInterval(updateGpu, 3000)

  return (
    <box
      orientation={Gtk.Orientation.HORIZONTAL}
      homogeneous
      spacing={8}
      cssClasses={["system-stats-strip"]}
      halign={Gtk.Align.FILL}
    >
      {/* 1. CPU Usage */}
      <box
        cssClasses={cpu.as((c) => ["stat-card", "cpu-card", c.cssClass])}
        tooltipText={cpu.as((c) => c.tooltip)}
        halign={Gtk.Align.FILL}
        valign={Gtk.Align.CENTER}
      >
        <box halign={Gtk.Align.CENTER} hexpand spacing={5}>
          <label label="" cssClasses={["stat-icon"]} />
          <label label={cpu.as((c) => c.text)} cssClasses={["stat-value"]} />
        </box>
      </box>

      {/* 2. RAM Usage */}
      <box
        cssClasses={ram.as((r) => ["stat-card", "ram-card", r.cssClass])}
        tooltipText={ram.as((r) => r.tooltip)}
        halign={Gtk.Align.FILL}
        valign={Gtk.Align.CENTER}
      >
        <box halign={Gtk.Align.CENTER} hexpand spacing={5}>
          <label label="󰍛" cssClasses={["stat-icon"]} />
          <label label={ram.as((r) => r.text)} cssClasses={["stat-value"]} />
        </box>
      </box>

      {/* 3. CPU Temperature */}
      <box
        cssClasses={cpuTemp.as((t) => ["stat-card", "cputemp-card", t.cssClass])}
        tooltipText={cpuTemp.as((t) => t.tooltip)}
        halign={Gtk.Align.FILL}
        valign={Gtk.Align.CENTER}
      >
        <box halign={Gtk.Align.CENTER} hexpand spacing={5}>
          <label label="" cssClasses={["stat-icon"]} />
          <label label={cpuTemp.as((t) => t.text)} cssClasses={["stat-value"]} />
        </box>
      </box>

      {/* 4. GPU Temperature */}
      <box
        cssClasses={gpuTemp.as((g) => ["stat-card", "gputemp-card", g.cssClass])}
        tooltipText={gpuTemp.as((g) => g.tooltip)}
        halign={Gtk.Align.FILL}
        valign={Gtk.Align.CENTER}
      >
        <box halign={Gtk.Align.CENTER} hexpand spacing={5}>
          <label label="󰢮" cssClasses={["stat-icon"]} />
          <label label={gpuTemp.as((g) => g.text)} cssClasses={["stat-value"]} />
        </box>
      </box>
    </box>
  )
}
