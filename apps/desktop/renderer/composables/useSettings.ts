// 设置的读取和订阅（S 章）：主进程是唯一来源，改了以后主进程广播 settings.changed，每个窗口跟着更新
import { DEFAULT_SETTINGS, EVENTS, type MarkoApi, type Settings, type SettingsPatch } from "@marko/shared";
import { onBeforeUnmount, shallowRef, type ShallowRef } from "vue";

export interface SettingsState {
  settings: ShallowRef<Settings>;
  update(patch: SettingsPatch): Promise<void>;
  ready: Promise<void>;
}

export function useSettings(api: MarkoApi): SettingsState {
  const settings = shallowRef<Settings>(DEFAULT_SETTINGS);
  const ready = api.settings.get().then((value) => {
    settings.value = value;
  });
  const off = api.on(EVENTS.settingsChanged, (value) => {
    settings.value = value;
  });
  onBeforeUnmount(off);
  return {
    settings,
    ready,
    async update(patch) {
      settings.value = await api.settings.set(patch);
    },
  };
}
