const DEFAULT_PRESETS = [
  { taskId: 'water',      name: '浇水', icon: 'icon-Water',    interval: 7,   enabled: false },
  { taskId: 'fertilize',  name: '施肥', icon: 'icon-feiliao',  interval: 30,  enabled: false },
  { taskId: 'repot',      name: '换盆', icon: 'icon-penzai',   interval: 180, enabled: false },
  { taskId: 'prune',      name: '修剪', icon: 'icon-Scissors', interval: 60,  enabled: false },
  { taskId: 'pesticide',  name: '除虫', icon: 'icon-bug',      interval: 30,  enabled: false },
  { taskId: 'fungicide',  name: '杀菌', icon: 'icon-wendu',    interval: 30,  enabled: false },
];

function parseCareTasksCompat(plant) {
  if (plant.carePlanEnabled === false) return [];
  if (plant.careTasks && plant.careTasks.length > 0) return plant.careTasks;
  // 旧数据：用全部预设，把浇水项替换成旧的 waterInterval 并开启
  const presets = DEFAULT_PRESETS.map(t => ({ ...t, lastDate: null }));
  if (plant.waterInterval) {
    const waterIdx = presets.findIndex(t => t.taskId === 'water');
    if (waterIdx >= 0) {
      presets[waterIdx] = {
        ...presets[waterIdx],
        interval: plant.waterInterval,
        lastDate: plant.lastWaterDate || null,
        enabled: true
      };
    }
  }
  return presets;
}

function calcTaskCountdown(task) {
  if (!task.lastDate) return task.interval;
  const last = new Date(task.lastDate);
  last.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
  return task.interval - diffDays;
}

function getDefaultPresets() {
  return DEFAULT_PRESETS.map(t => ({ ...t, lastDate: null }));
}

module.exports = { parseCareTasksCompat, calcTaskCountdown, getDefaultPresets };
