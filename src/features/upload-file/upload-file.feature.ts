import AdminJS, {
  After,
  buildFeature, ComponentLoader,
  FeatureType,
  ListActionResponse,
  RecordActionResponse,
} from 'adminjs';
import { ERROR_MESSAGES } from './constants'
import { deleteFileFactory } from './factories/delete-file-factory'
import { deleteFilesFactory } from './factories/delete-files-factory'
import { stripPayloadFactory } from './factories/strip-payload-factory'
import { updateRecordFactory } from './factories/update-record-factory'
import { BaseProvider } from './providers'
import PropertyCustom from './types/property-custom.type'
import UploadOptions, { UploadOptionsWithDefault } from './types/upload-options.type'
import { fillRecordWithPath } from './utils/fill-record-with-path'
import { getProvider } from './utils/get-provider'

const DEFAULT_FILE_PROPERTY = 'file'
const DEFAULT_FILE_PATH_PROPERTY = 'filePath'
const DEFAULT_FILES_TO_DELETE_PROPERTY = 'filesToDelete'

export const registerComponents = (componentLoader: ComponentLoader) => {
  return {
    UploadFileEdit: componentLoader.add('UploadFileEdit', '../../../src/features/upload-file/components/edit'),
    UploadFileList: componentLoader.add('UploadFileList', '../../../src/features/upload-file/components/list'),
    UploadFileShow: componentLoader.add('UploadFileShow', '../../../src/features/upload-file/components/show'),
  }
}

const uploadFileFeature = (config: UploadOptions): FeatureType => {
  console.log('in uploadFileFeature');
  const { provider: providerOptions, validation, multiple, parentArray } = config

  const configWithDefault: UploadOptionsWithDefault = {
    ...config,
    properties: {
      ...config.properties,
      file: config.properties?.file || DEFAULT_FILE_PROPERTY,
      filePath: config.properties?.filePath || DEFAULT_FILE_PATH_PROPERTY,
      filesToDelete:
        config.properties?.filesToDelete || DEFAULT_FILES_TO_DELETE_PROPERTY,
    },
  }

  const { properties } = configWithDefault
  const { provider, name: providerName } = getProvider(providerOptions)

  if (!properties.key) {
    throw new Error(ERROR_MESSAGES.NO_KEY_PROPERTY)
  }

  const stripFileFromPayload = stripPayloadFactory(configWithDefault)
  const updateRecord = updateRecordFactory(configWithDefault, provider)
  const deleteFile = deleteFileFactory(configWithDefault, provider)
  const deleteFiles = deleteFilesFactory(configWithDefault, provider)

  const fillPath: After<RecordActionResponse> = async (
    response,
    request,
    context,
  ) => {
    const { record } = response

    return {
      ...response,
      record: await fillRecordWithPath(
        record,
        context,
        configWithDefault,
        provider,
      ),
    }
  }

  const fillPaths: After<ListActionResponse> = async (
    response,
    request,
    context,
  ) => {
    const { records } = response

    return {
      ...response,
      records: await Promise.all(
        records.map((record) => fillRecordWithPath(record, context, configWithDefault, provider)),
      ),
    }
  }

  const custom: PropertyCustom = {
    fileProperty: properties.file,
    filePathProperty: properties.filePath,
    filesToDeleteProperty: properties.filesToDelete,
    provider: providerName,
    keyProperty: properties.key,
    bucketProperty: properties.bucket,
    mimeTypeProperty: properties.mimeType,
    // bucket property can be empty so default bucket has to be passed
    defaultBucket: provider.bucket,
    mimeTypes: validation?.mimeTypes,
    maxSize: validation?.maxSize,
    multiple: !!multiple,
    parentArray,
    opts: provider?.opts,
  }

  const fileProperty = parentArray ? `${parentArray}.${properties.file}` : properties.file

  let components = { edit: '', list: '', show: '' };

  //TODO: refactor this
  if (!config.componentLoader) {
    console.log('don\'t have componentLoader, using deprecated bundle()')
    components.edit = AdminJS.bundle(
      '../../../src/features/upload-file/components/edit',
    );
    components.list = AdminJS.bundle(
      '../../../src/features/upload-file/components/list',
    );
    components.show = AdminJS.bundle(
      '../../../src/features/upload-file/components/show',
    );
  } else {
    console.log('have a componentLoader, using it')
    const { UploadFileEdit: edit, UploadFileList: list, UploadFileShow: show } = registerComponents(config.componentLoader);
    components = { edit, list, show };
    console.log(config.componentLoader.getComponents());
  }

  const uploadFeature = buildFeature({
    properties: {
      [fileProperty]: {
        custom,
        isVisible: { show: true, edit: true, list: true, filter: false },
        components,
      },
    },
    actions: {
      show: {
        after: fillPath,
      },
      new: {
        before: stripFileFromPayload,
        after: [updateRecord, fillPath],
      },
      edit: {
        before: [stripFileFromPayload],
        after: [updateRecord, fillPath],
      },
      delete: {
        after: deleteFile,
      },
      list: {
        after: fillPaths,
      },
      bulkDelete: {
        after: deleteFiles,
      },
    },
  })

  return uploadFeature
}

export default uploadFileFeature
