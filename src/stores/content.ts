import { useTreeBuilder } from '@/composables'
import { FilePriority } from '@/constants/qbit'
import { qbit } from '@/services'
import { useDialogStore } from '@/stores/dialog'
import { useMaindataStore } from '@/stores/maindata'
import { useVueTorrentStore } from '@/stores/vuetorrent'
import { TorrentFile } from '@/types/qbit/models'
import { RightClickMenuEntryType, RightClickProperties, TreeNode } from '@/types/vuetorrent'
import { useIntervalFn } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

export const useContentStore = defineStore('content', () => {
  const { t } = useI18n()
  const route = useRoute()
  const dialogStore = useDialogStore()
  const maindataStore = useMaindataStore()
  const { fileContentInterval } = storeToRefs(useVueTorrentStore())

  const hash = computed(() => route.params.hash as string)

  const rightClickProperties = reactive<RightClickProperties>({
    isVisible: false,
    offset: [0, 0]
  })
  const _lock = ref(false)
  const cachedFiles = ref<TorrentFile[]>([])
  const openedItems = ref(['(root)'])
  const { tree } = useTreeBuilder(cachedFiles)

  const flatTree = computed(() => {
    const flatten = (node: TreeNode, parentPath: string): TreeNode[] => {
      const path = parentPath === '' ? node.name : parentPath + '/' + node.name

      if (node.type === 'folder' && openedItems.value.includes(node.fullName)) {
        const children = node.children
          .toSorted((a: TreeNode, b: TreeNode) => {
            if (a.type === 'folder' && b.type === 'file') return -1
            if (a.type === 'file' && b.type === 'folder') return 1
            return a.name.localeCompare(b.name)
          })
          .flatMap(el => flatten(el, path))
        return [node, ...children]
      } else {
        return [node]
      }
    }

    return flatten(tree.value, '')
  })

  const internalSelection = ref<Set<string>>(new Set())
  const selectedNodes = computed<TreeNode[]>(() => (internalSelection.value.size === 0 ? [] : flatTree.value.filter(node => internalSelection.value.has(node.fullName))))
  const selectedNode = computed<TreeNode | null>(() => (selectedNodes.value.length > 0 ? selectedNodes.value[0] : null))
  const selectedIds = computed<number[]>(() =>
    selectedNodes.value
      .map(node => node.getChildrenIds())
      .flat()
      .filter((v, i, a) => a.indexOf(v) === i)
  )

  const menuData = computed<RightClickMenuEntryType[]>(() => [
    {
      text: t(`torrentDetail.content.rename.bulk`),
      icon: 'mdi-rename',
      hidden: true, // internalSelection.value.size <= 1
      action: bulkRename
    },
    {
      text: t(`torrentDetail.content.rename.${selectedNode.value?.type || 'file'}`),
      icon: 'mdi-rename',
      hidden: internalSelection.value.size > 1 || selectedNode.value?.name === '(root)',
      action: () => renameNode(selectedNode.value!)
    },
    {
      text: t('torrentDetail.content.priority'),
      icon: 'mdi-trending-up',
      children: [
        { text: t('constants.file_priority.max'), icon: 'mdi-arrow-up', action: () => setFilePriority(selectedIds.value, FilePriority.MAXIMAL) },
        { text: t('constants.file_priority.high'), icon: 'mdi-arrow-top-right', action: () => setFilePriority(selectedIds.value, FilePriority.HIGH) },
        { text: t('constants.file_priority.normal'), icon: 'mdi-minus', action: () => setFilePriority(selectedIds.value, FilePriority.NORMAL) },
        { text: t('constants.file_priority.unwanted'), icon: 'mdi-cancel', action: () => setFilePriority(selectedIds.value, FilePriority.DO_NOT_DOWNLOAD) }
      ]
    }
  ])

  const { pause: pauseTimer, resume: resumeTimer } = useIntervalFn(updateFileTree, fileContentInterval, {
    immediate: false,
    immediateCallback: true
  })

  async function updateFileTree() {
    if (_lock.value) return
    _lock.value = true
    await nextTick()

    cachedFiles.value = await maindataStore.fetchFiles(hash.value)

    _lock.value = false
    await nextTick()
  }

  const renameDialog = ref('')

  const renamePayload = reactive({
    hash: '',
    isFolder: false,
    oldName: ''
  })

  async function renameNode(node: TreeNode) {
    const { default: MoveTorrentFileDialog } = await import('@/components/Dialogs/MoveTorrentFileDialog.vue')
    renamePayload.hash = hash.value
    renamePayload.isFolder = node.type === 'folder'
    renamePayload.oldName = node.fullName
    renameDialog.value = dialogStore.createDialog(MoveTorrentFileDialog, renamePayload)
  }

  async function bulkRename() {
    //TODO
  }

  async function renameTorrentFile(hash: string, oldPath: string, newPath: string) {
    await qbit.renameFile(hash, oldPath, newPath)
  }

  async function renameTorrentFolder(hash: string, oldPath: string, newPath: string) {
    await qbit.renameFolder(hash, oldPath, newPath)
  }

  async function setFilePriority(fileIdx: number[], priority: FilePriority) {
    await qbit.setTorrentFilePriority(hash.value, fileIdx, priority)
    await updateFileTree()
  }

  watch(
    () => dialogStore.isDialogOpened(renameDialog.value),
    async v => {
      if (!v) {
        await updateFileTree()
      }
    }
  )

  return {
    rightClickProperties,
    internalSelection,
    menuData,
    cachedFiles,
    openedItems,
    tree,
    flatTree,
    updateFileTree,
    pauseTimer,
    resumeTimer,
    renameTorrentFile,
    renameTorrentFolder,
    setFilePriority,
    $reset: () => {
      while (_lock.value) {}
      internalSelection.value.clear()
      cachedFiles.value = []
      openedItems.value = ['(root)']
      pauseTimer()
    }
  }
})
