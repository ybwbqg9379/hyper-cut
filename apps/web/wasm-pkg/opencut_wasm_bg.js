/**
 * @returns {number}
 */
export function TICKS_PER_SECOND() {
    const ret = wasm.TICKS_PER_SECOND();
    return ret;
}

/**
 * @param {any} options
 * @returns {OffscreenCanvas}
 */
export function applyEffectPasses(options) {
    const ret = wasm.applyEffectPasses(options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {any} options
 * @returns {OffscreenCanvas}
 */
export function applyMaskFeather(options) {
    const ret = wasm.applyMaskFeather(options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * @param {FloorToFrameOptions} arg0
 * @returns {MediaTime | undefined}
 */
export function floorToFrame(arg0) {
    const ret = wasm.floorToFrame(arg0);
    return ret;
}

/**
 * @param {FormatTimecodeOptions} arg0
 * @returns {string | undefined}
 */
export function formatTimecode(arg0) {
    const ret = wasm.formatTimecode(arg0);
    let v1;
    if (ret[0] !== 0) {
        v1 = getStringFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
}

/**
 * @param {GuessTimecodeFormatOptions} arg0
 * @returns {TimeCodeFormat | undefined}
 */
export function guessTimecodeFormat(arg0) {
    const ret = wasm.guessTimecodeFormat(arg0);
    return ret;
}

/**
 * @returns {Promise<void>}
 */
export function initializeGpu() {
    const ret = wasm.initializeGpu();
    return ret;
}

/**
 * @param {IsFrameAlignedOptions} arg0
 * @returns {boolean | undefined}
 */
export function isFrameAligned(arg0) {
    const ret = wasm.isFrameAligned(arg0);
    return ret === 0xFFFFFF ? undefined : ret !== 0;
}

/**
 * @param {LastFrameTimeOptions} arg0
 * @returns {MediaTime | undefined}
 */
export function lastFrameTime(arg0) {
    const ret = wasm.lastFrameTime(arg0);
    return ret;
}

/**
 * @param {MediaTimeAddOptions} arg0
 * @returns {MediaTime}
 */
export function mediaTimeAdd(arg0) {
    const ret = wasm.mediaTimeAdd(arg0);
    return ret;
}

/**
 * @param {MediaTimeClampOptions} arg0
 * @returns {MediaTime}
 */
export function mediaTimeClamp(arg0) {
    const ret = wasm.mediaTimeClamp(arg0);
    return ret;
}

/**
 * @param {MediaTimeFromFrameOptions} arg0
 * @returns {MediaTime | undefined}
 */
export function mediaTimeFromFrame(arg0) {
    const ret = wasm.mediaTimeFromFrame(arg0);
    return ret;
}

/**
 * @param {MediaTimeFromSecondsOptions} arg0
 * @returns {MediaTime | undefined}
 */
export function mediaTimeFromSeconds(arg0) {
    const ret = wasm.mediaTimeFromSeconds(arg0);
    return ret;
}

/**
 * @param {MediaTimeMaxOptions} arg0
 * @returns {MediaTime}
 */
export function mediaTimeMax(arg0) {
    const ret = wasm.mediaTimeMax(arg0);
    return ret;
}

/**
 * @param {MediaTimeMinOptions} arg0
 * @returns {MediaTime}
 */
export function mediaTimeMin(arg0) {
    const ret = wasm.mediaTimeMin(arg0);
    return ret;
}

/**
 * @param {MediaTimeSubOptions} arg0
 * @returns {MediaTime}
 */
export function mediaTimeSub(arg0) {
    const ret = wasm.mediaTimeSub(arg0);
    return ret;
}

/**
 * @param {MediaTimeToFrameOptions} arg0
 * @returns {bigint | undefined}
 */
export function mediaTimeToFrame(arg0) {
    const ret = wasm.mediaTimeToFrame(arg0);
    return ret[0] === 0 ? undefined : ret[1];
}

/**
 * @param {MediaTimeToSecondsOptions} arg0
 * @returns {number}
 */
export function mediaTimeToSeconds(arg0) {
    const ret = wasm.mediaTimeToSeconds(arg0);
    return ret;
}

/**
 * @param {ParseTimecodeOptions} arg0
 * @returns {MediaTime | undefined}
 */
export function parseTimecode(arg0) {
    const ret = wasm.parseTimecode(arg0);
    return ret;
}

/**
 * @param {RoundToFrameOptions} arg0
 * @returns {MediaTime | undefined}
 */
export function roundToFrame(arg0) {
    const ret = wasm.roundToFrame(arg0);
    return ret;
}

/**
 * @param {SnappedSeekTimeOptions} arg0
 * @returns {MediaTime | undefined}
 */
export function snappedSeekTime(arg0) {
    const ret = wasm.snappedSeekTime(arg0);
    return ret;
}
export function __wbg_Error_7c536b7a8123d334(arg0, arg1) {
    const ret = Error(getStringFromWasm0(arg0, arg1));
    return ret;
}
export function __wbg_Number_d2ed9f811fff7051(arg0) {
    const ret = Number(arg0);
    return ret;
}
export function __wbg_String_8564e559799eccda(arg0, arg1) {
    const ret = String(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_Window_5bac5165340af82e(arg0) {
    const ret = arg0.Window;
    return ret;
}
export function __wbg_WorkerGlobalScope_d0d150069210a6e8(arg0) {
    const ret = arg0.WorkerGlobalScope;
    return ret;
}
export function __wbg___wbindgen_bigint_get_as_i64_3d66614a210167c9(arg0, arg1) {
    const v = arg1;
    const ret = typeof(v) === 'bigint' ? v : undefined;
    getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
}
export function __wbg___wbindgen_boolean_get_6abe7d340f528f63(arg0) {
    const v = arg0;
    const ret = typeof(v) === 'boolean' ? v : undefined;
    return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
}
export function __wbg___wbindgen_debug_string_8baecc377ad92880(arg0, arg1) {
    const ret = debugString(arg1);
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg___wbindgen_in_840bcdd0dba8d13c(arg0, arg1) {
    const ret = arg0 in arg1;
    return ret;
}
export function __wbg___wbindgen_is_bigint_4393a1b8e13fdf64(arg0) {
    const ret = typeof(arg0) === 'bigint';
    return ret;
}
export function __wbg___wbindgen_is_function_d4c2480b46f29e33(arg0) {
    const ret = typeof(arg0) === 'function';
    return ret;
}
export function __wbg___wbindgen_is_null_77356bc8da6bb199(arg0) {
    const ret = arg0 === null;
    return ret;
}
export function __wbg___wbindgen_is_object_e04e3a51a90cde43(arg0) {
    const val = arg0;
    const ret = typeof(val) === 'object' && val !== null;
    return ret;
}
export function __wbg___wbindgen_is_string_3db04af369717583(arg0) {
    const ret = typeof(arg0) === 'string';
    return ret;
}
export function __wbg___wbindgen_is_undefined_5957b329897cc39c(arg0) {
    const ret = arg0 === undefined;
    return ret;
}
export function __wbg___wbindgen_jsval_eq_8d2fb89b36afbec9(arg0, arg1) {
    const ret = arg0 === arg1;
    return ret;
}
export function __wbg___wbindgen_jsval_loose_eq_54779efa0bc46b0b(arg0, arg1) {
    const ret = arg0 == arg1;
    return ret;
}
export function __wbg___wbindgen_number_get_4fcba947d278ad7c(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'number' ? obj : undefined;
    getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
}
export function __wbg___wbindgen_string_get_ae6081df8158aa73(arg0, arg1) {
    const obj = arg1;
    const ret = typeof(obj) === 'string' ? obj : undefined;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg___wbindgen_throw_bd5a70920abf0236(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
}
export function __wbg__wbg_cb_unref_207c541c2d58dfb3(arg0) {
    arg0._wbg_cb_unref();
}
export function __wbg_beginRenderPass_a19cc6156a7858b4() { return handleError(function (arg0, arg1) {
    const ret = arg0.beginRenderPass(arg1);
    return ret;
}, arguments); }
export function __wbg_call_1aea13500fe8ff6c() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.call(arg1, arg2);
    return ret;
}, arguments); }
export function __wbg_call_faf6b66fc4667ce6() { return handleError(function (arg0, arg1) {
    const ret = arg0.call(arg1);
    return ret;
}, arguments); }
export function __wbg_configure_16541864db644c70() { return handleError(function (arg0, arg1) {
    arg0.configure(arg1);
}, arguments); }
export function __wbg_copyExternalImageToTexture_6d56ad685a99824d() { return handleError(function (arg0, arg1, arg2, arg3) {
    arg0.copyExternalImageToTexture(arg1, arg2, arg3);
}, arguments); }
export function __wbg_createBindGroupLayout_adb8337a6808ae24() { return handleError(function (arg0, arg1) {
    const ret = arg0.createBindGroupLayout(arg1);
    return ret;
}, arguments); }
export function __wbg_createBindGroup_91159ca759115307(arg0, arg1) {
    const ret = arg0.createBindGroup(arg1);
    return ret;
}
export function __wbg_createBuffer_59de141e89014140() { return handleError(function (arg0, arg1) {
    const ret = arg0.createBuffer(arg1);
    return ret;
}, arguments); }
export function __wbg_createCommandEncoder_dc2b2ca6f09bd4c3(arg0, arg1) {
    const ret = arg0.createCommandEncoder(arg1);
    return ret;
}
export function __wbg_createPipelineLayout_a5290f84492f8b1e(arg0, arg1) {
    const ret = arg0.createPipelineLayout(arg1);
    return ret;
}
export function __wbg_createRenderPipeline_f7aca470ad8ce865() { return handleError(function (arg0, arg1) {
    const ret = arg0.createRenderPipeline(arg1);
    return ret;
}, arguments); }
export function __wbg_createSampler_6b972cd00bcc5dfb(arg0, arg1) {
    const ret = arg0.createSampler(arg1);
    return ret;
}
export function __wbg_createShaderModule_bbe0476992dd060e(arg0, arg1) {
    const ret = arg0.createShaderModule(arg1);
    return ret;
}
export function __wbg_createTexture_011d4b0badf853e3() { return handleError(function (arg0, arg1) {
    const ret = arg0.createTexture(arg1);
    return ret;
}, arguments); }
export function __wbg_createView_1ef8f1ddc16facb0() { return handleError(function (arg0, arg1) {
    const ret = arg0.createView(arg1);
    return ret;
}, arguments); }
export function __wbg_document_8d00b6db6f4e3e5e(arg0) {
    const ret = arg0.document;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}
export function __wbg_done_e0b2820e599cb9f4(arg0) {
    const ret = arg0.done;
    return ret;
}
export function __wbg_draw_9a35daa0096c6f2c(arg0, arg1, arg2, arg3, arg4) {
    arg0.draw(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
}
export function __wbg_end_1db12af2e0ff1235(arg0) {
    arg0.end();
}
export function __wbg_entries_e234c7de8150095c(arg0) {
    const ret = Object.entries(arg0);
    return ret;
}
export function __wbg_finish_48a7b6da7b76999e(arg0) {
    const ret = arg0.finish();
    return ret;
}
export function __wbg_finish_68d7c5925d3fa394(arg0, arg1) {
    const ret = arg0.finish(arg1);
    return ret;
}
export function __wbg_getContext_064ba67b26a73a3e() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments); }
export function __wbg_getContext_30f7143eeaed637c() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}, arguments); }
export function __wbg_getCurrentTexture_9b00da7f6bc38606() { return handleError(function (arg0) {
    const ret = arg0.getCurrentTexture();
    return ret;
}, arguments); }
export function __wbg_getMappedRange_4a3dc3f452433b71() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.getMappedRange(arg1, arg2);
    return ret;
}, arguments); }
export function __wbg_getPreferredCanvasFormat_54381f1ef7aec03d(arg0) {
    const ret = arg0.getPreferredCanvasFormat();
    return (__wbindgen_enum_GpuTextureFormat.indexOf(ret) + 1 || 96) - 1;
}
export function __wbg_get_480fa63526daa580(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}
export function __wbg_get_8944f33c9c7f4f6c(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
}
export function __wbg_get_97a4b9029a97fbd6() { return handleError(function (arg0, arg1) {
    const ret = Reflect.get(arg0, arg1);
    return ret;
}, arguments); }
export function __wbg_get_d8a3d51a73d14c8a() { return handleError(function (arg0, arg1) {
    const ret = Reflect.get(arg0, arg1);
    return ret;
}, arguments); }
export function __wbg_get_unchecked_c33f0e513c522d7c(arg0, arg1) {
    const ret = arg0[arg1 >>> 0];
    return ret;
}
export function __wbg_get_with_ref_key_6412cf3094599694(arg0, arg1) {
    const ret = arg0[arg1];
    return ret;
}
export function __wbg_gpu_3f9d7df9a18237f8(arg0) {
    const ret = arg0.gpu;
    return ret;
}
export function __wbg_instanceof_ArrayBuffer_046631d47961f5fe(arg0) {
    let result;
    try {
        result = arg0 instanceof ArrayBuffer;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_GpuAdapter_dc7e13c1676da9bd(arg0) {
    let result;
    try {
        result = arg0 instanceof GPUAdapter;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_GpuCanvasContext_c2609c698a76a6b6(arg0) {
    let result;
    try {
        result = arg0 instanceof GPUCanvasContext;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_Object_a99dcb8b396fa196(arg0) {
    let result;
    try {
        result = arg0 instanceof Object;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_OffscreenCanvas_34012446c4da8c89(arg0) {
    let result;
    try {
        result = arg0 instanceof OffscreenCanvas;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_Uint8Array_e7d245baab296394(arg0) {
    let result;
    try {
        result = arg0 instanceof Uint8Array;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_instanceof_Window_4bfad3a9470c25c9(arg0) {
    let result;
    try {
        result = arg0 instanceof Window;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
}
export function __wbg_isArray_8dc932f4b6997756(arg0) {
    const ret = Array.isArray(arg0);
    return ret;
}
export function __wbg_isSafeInteger_db44a36710ec7a10(arg0) {
    const ret = Number.isSafeInteger(arg0);
    return ret;
}
export function __wbg_iterator_8af67730d17a1376() {
    const ret = Symbol.iterator;
    return ret;
}
export function __wbg_label_18cae34ff19933d7(arg0, arg1) {
    const ret = arg1.label;
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
    getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
}
export function __wbg_length_090b6aa6235450ba(arg0) {
    const ret = arg0.length;
    return ret;
}
export function __wbg_length_713cc1160ce7b5b9(arg0) {
    const ret = arg0.length;
    return ret;
}
export function __wbg_limits_8837ca9ac1296563(arg0) {
    const ret = arg0.limits;
    return ret;
}
export function __wbg_mapAsync_288e2fddbc3f7f7b(arg0, arg1, arg2, arg3) {
    const ret = arg0.mapAsync(arg1 >>> 0, arg2, arg3);
    return ret;
}
export function __wbg_maxBindGroups_3e48365ce9cb69b2(arg0) {
    const ret = arg0.maxBindGroups;
    return ret;
}
export function __wbg_maxBindingsPerBindGroup_19eab6283879be75(arg0) {
    const ret = arg0.maxBindingsPerBindGroup;
    return ret;
}
export function __wbg_maxBufferSize_8086300d000af7cb(arg0) {
    const ret = arg0.maxBufferSize;
    return ret;
}
export function __wbg_maxColorAttachmentBytesPerSample_ee822e1793bea12f(arg0) {
    const ret = arg0.maxColorAttachmentBytesPerSample;
    return ret;
}
export function __wbg_maxColorAttachments_3110f22e4c5e3621(arg0) {
    const ret = arg0.maxColorAttachments;
    return ret;
}
export function __wbg_maxComputeInvocationsPerWorkgroup_e1b61d9c74f79e81(arg0) {
    const ret = arg0.maxComputeInvocationsPerWorkgroup;
    return ret;
}
export function __wbg_maxComputeWorkgroupSizeX_202ebe3252c09676(arg0) {
    const ret = arg0.maxComputeWorkgroupSizeX;
    return ret;
}
export function __wbg_maxComputeWorkgroupSizeY_4f66f59c2daaa8f1(arg0) {
    const ret = arg0.maxComputeWorkgroupSizeY;
    return ret;
}
export function __wbg_maxComputeWorkgroupSizeZ_eadb1eb36902e045(arg0) {
    const ret = arg0.maxComputeWorkgroupSizeZ;
    return ret;
}
export function __wbg_maxComputeWorkgroupStorageSize_05e0131572ec6c1e(arg0) {
    const ret = arg0.maxComputeWorkgroupStorageSize;
    return ret;
}
export function __wbg_maxComputeWorkgroupsPerDimension_47cd4aa37eba4a57(arg0) {
    const ret = arg0.maxComputeWorkgroupsPerDimension;
    return ret;
}
export function __wbg_maxDynamicStorageBuffersPerPipelineLayout_122112462e514d25(arg0) {
    const ret = arg0.maxDynamicStorageBuffersPerPipelineLayout;
    return ret;
}
export function __wbg_maxDynamicUniformBuffersPerPipelineLayout_4c57dbd81a8d1c49(arg0) {
    const ret = arg0.maxDynamicUniformBuffersPerPipelineLayout;
    return ret;
}
export function __wbg_maxInterStageShaderVariables_5bb90c2a06f1e9ce(arg0) {
    const ret = arg0.maxInterStageShaderVariables;
    return ret;
}
export function __wbg_maxSampledTexturesPerShaderStage_cea16550f969bbdc(arg0) {
    const ret = arg0.maxSampledTexturesPerShaderStage;
    return ret;
}
export function __wbg_maxSamplersPerShaderStage_1cbd8dba92d87dd9(arg0) {
    const ret = arg0.maxSamplersPerShaderStage;
    return ret;
}
export function __wbg_maxStorageBufferBindingSize_ff2e77e686018944(arg0) {
    const ret = arg0.maxStorageBufferBindingSize;
    return ret;
}
export function __wbg_maxStorageBuffersPerShaderStage_e496ad22f8b97f12(arg0) {
    const ret = arg0.maxStorageBuffersPerShaderStage;
    return ret;
}
export function __wbg_maxStorageTexturesPerShaderStage_258aab0d332d9efe(arg0) {
    const ret = arg0.maxStorageTexturesPerShaderStage;
    return ret;
}
export function __wbg_maxTextureArrayLayers_6fffbda0cd6f3036(arg0) {
    const ret = arg0.maxTextureArrayLayers;
    return ret;
}
export function __wbg_maxTextureDimension1D_53d154cf8f16d439(arg0) {
    const ret = arg0.maxTextureDimension1D;
    return ret;
}
export function __wbg_maxTextureDimension2D_578c2c471b73bb60(arg0) {
    const ret = arg0.maxTextureDimension2D;
    return ret;
}
export function __wbg_maxTextureDimension3D_3532b309b08a5ddf(arg0) {
    const ret = arg0.maxTextureDimension3D;
    return ret;
}
export function __wbg_maxUniformBufferBindingSize_6c3b6b8424799146(arg0) {
    const ret = arg0.maxUniformBufferBindingSize;
    return ret;
}
export function __wbg_maxUniformBuffersPerShaderStage_911223507ba8d12a(arg0) {
    const ret = arg0.maxUniformBuffersPerShaderStage;
    return ret;
}
export function __wbg_maxVertexAttributes_399d9b947e980d08(arg0) {
    const ret = arg0.maxVertexAttributes;
    return ret;
}
export function __wbg_maxVertexBufferArrayStride_b5550ff3b3aa4a9e(arg0) {
    const ret = arg0.maxVertexBufferArrayStride;
    return ret;
}
export function __wbg_maxVertexBuffers_15be37c3f8fbfe0a(arg0) {
    const ret = arg0.maxVertexBuffers;
    return ret;
}
export function __wbg_minStorageBufferOffsetAlignment_5c389200e0be5fe1(arg0) {
    const ret = arg0.minStorageBufferOffsetAlignment;
    return ret;
}
export function __wbg_minUniformBufferOffsetAlignment_b9d974e659cd3e20(arg0) {
    const ret = arg0.minUniformBufferOffsetAlignment;
    return ret;
}
export function __wbg_navigator_a6aef662775ce236(arg0) {
    const ret = arg0.navigator;
    return ret;
}
export function __wbg_navigator_cda717510f3a4a47(arg0) {
    const ret = arg0.navigator;
    return ret;
}
export function __wbg_new_4774b8d4db1224e4(arg0) {
    const ret = new Uint8Array(arg0);
    return ret;
}
export function __wbg_new_480195ddf7042529() {
    const ret = new Array();
    return ret;
}
export function __wbg_new_cc88e2b82fb56b5e() { return handleError(function (arg0, arg1) {
    const ret = new OffscreenCanvas(arg0 >>> 0, arg1 >>> 0);
    return ret;
}, arguments); }
export function __wbg_new_e4597c3f125a2038() {
    const ret = new Object();
    return ret;
}
export function __wbg_new_typed_5101eada2c6754de(arg0, arg1) {
    try {
        var state0 = {a: arg0, b: arg1};
        var cb0 = (arg0, arg1) => {
            const a = state0.a;
            state0.a = 0;
            try {
                return wasm_bindgen__convert__closures_____invoke__h41b114d20b0b0163(a, state0.b, arg0, arg1);
            } finally {
                state0.a = a;
            }
        };
        const ret = new Promise(cb0);
        return ret;
    } finally {
        state0.a = 0;
    }
}
export function __wbg_new_with_byte_offset_and_length_716709b677573556(arg0, arg1, arg2) {
    const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
    return ret;
}
export function __wbg_next_9a5990d0355cdd1a() { return handleError(function (arg0) {
    const ret = arg0.next();
    return ret;
}, arguments); }
export function __wbg_next_e75ce91d696d3c0f(arg0) {
    const ret = arg0.next;
    return ret;
}
export function __wbg_onSubmittedWorkDone_81e152567230130a(arg0) {
    const ret = arg0.onSubmittedWorkDone();
    return ret;
}
export function __wbg_prototypesetcall_7dca54d31cb9d2dc(arg0, arg1, arg2) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
}
export function __wbg_push_bb0def92a641d074(arg0, arg1) {
    const ret = arg0.push(arg1);
    return ret;
}
export function __wbg_querySelectorAll_8f983d85893fba25() { return handleError(function (arg0, arg1, arg2) {
    const ret = arg0.querySelectorAll(getStringFromWasm0(arg1, arg2));
    return ret;
}, arguments); }
export function __wbg_queueMicrotask_1f50b4bdf2c98605(arg0) {
    queueMicrotask(arg0);
}
export function __wbg_queueMicrotask_805204511f79bee8(arg0) {
    const ret = arg0.queueMicrotask;
    return ret;
}
export function __wbg_queue_81f5d725809ccd54(arg0) {
    const ret = arg0.queue;
    return ret;
}
export function __wbg_requestAdapter_90f7496e67f82c21(arg0, arg1) {
    const ret = arg0.requestAdapter(arg1);
    return ret;
}
export function __wbg_requestDevice_5c307ce72228d3f7(arg0, arg1) {
    const ret = arg0.requestDevice(arg1);
    return ret;
}
export function __wbg_resolve_bb4df27803d377b2(arg0) {
    const ret = Promise.resolve(arg0);
    return ret;
}
export function __wbg_setBindGroup_58960c4b1bcdd182(arg0, arg1, arg2) {
    arg0.setBindGroup(arg1 >>> 0, arg2);
}
export function __wbg_setBindGroup_a62f9de1cb2449b2() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    arg0.setBindGroup(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
}, arguments); }
export function __wbg_setPipeline_9f6b0a3c5901572d(arg0, arg1) {
    arg0.setPipeline(arg1);
}
export function __wbg_setVertexBuffer_c3bb3670263af952(arg0, arg1, arg2, arg3, arg4) {
    arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3, arg4);
}
export function __wbg_set_05b085c909633819() { return handleError(function (arg0, arg1, arg2) {
    const ret = Reflect.set(arg0, arg1, arg2);
    return ret;
}, arguments); }
export function __wbg_set_311d3efbf4bfd23f(arg0, arg1, arg2) {
    arg0.set(arg1, arg2 >>> 0);
}
export function __wbg_set_a_2f4495829c853bba(arg0, arg1) {
    arg0.a = arg1;
}
export function __wbg_set_access_802ef755476d4064(arg0, arg1) {
    arg0.access = __wbindgen_enum_GpuStorageTextureAccess[arg1];
}
export function __wbg_set_address_mode_u_c13cdf94d097b16d(arg0, arg1) {
    arg0.addressModeU = __wbindgen_enum_GpuAddressMode[arg1];
}
export function __wbg_set_address_mode_v_c09db9861cd052a6(arg0, arg1) {
    arg0.addressModeV = __wbindgen_enum_GpuAddressMode[arg1];
}
export function __wbg_set_address_mode_w_0b49c35f3d4322bf(arg0, arg1) {
    arg0.addressModeW = __wbindgen_enum_GpuAddressMode[arg1];
}
export function __wbg_set_alpha_29642d2219224544(arg0, arg1) {
    arg0.alpha = arg1;
}
export function __wbg_set_alpha_mode_65ba0adaef90e1f3(arg0, arg1) {
    arg0.alphaMode = __wbindgen_enum_GpuCanvasAlphaMode[arg1];
}
export function __wbg_set_alpha_to_coverage_enabled_ab6a22e18e338493(arg0, arg1) {
    arg0.alphaToCoverageEnabled = arg1 !== 0;
}
export function __wbg_set_array_layer_count_de83f575c3f6d15e(arg0, arg1) {
    arg0.arrayLayerCount = arg1 >>> 0;
}
export function __wbg_set_array_stride_2033aeb8a42130f9(arg0, arg1) {
    arg0.arrayStride = arg1;
}
export function __wbg_set_aspect_adde591ce42eb208(arg0, arg1) {
    arg0.aspect = __wbindgen_enum_GpuTextureAspect[arg1];
}
export function __wbg_set_aspect_feb0fac859e82372(arg0, arg1) {
    arg0.aspect = __wbindgen_enum_GpuTextureAspect[arg1];
}
export function __wbg_set_attributes_39e5a71bf05309a6(arg0, arg1) {
    arg0.attributes = arg1;
}
export function __wbg_set_b_7081554879455e65(arg0, arg1) {
    arg0.b = arg1;
}
export function __wbg_set_base_array_layer_ab196aad24c8fac6(arg0, arg1) {
    arg0.baseArrayLayer = arg1 >>> 0;
}
export function __wbg_set_base_mip_level_15d29fc182e25a82(arg0, arg1) {
    arg0.baseMipLevel = arg1 >>> 0;
}
export function __wbg_set_beginning_of_pass_write_index_c2f97408798615ca(arg0, arg1) {
    arg0.beginningOfPassWriteIndex = arg1 >>> 0;
}
export function __wbg_set_bind_group_layouts_5c298441f47e30a1(arg0, arg1) {
    arg0.bindGroupLayouts = arg1;
}
export function __wbg_set_binding_234b4c508d19a0a8(arg0, arg1) {
    arg0.binding = arg1 >>> 0;
}
export function __wbg_set_binding_fd933455b600a07f(arg0, arg1) {
    arg0.binding = arg1 >>> 0;
}
export function __wbg_set_blend_1dbdd086fc4fdebf(arg0, arg1) {
    arg0.blend = arg1;
}
export function __wbg_set_buffer_8f0ef5be1b92d605(arg0, arg1) {
    arg0.buffer = arg1;
}
export function __wbg_set_buffer_b04e4d70b1eb4630(arg0, arg1) {
    arg0.buffer = arg1;
}
export function __wbg_set_buffers_3f9c487ea01dddcf(arg0, arg1) {
    arg0.buffers = arg1;
}
export function __wbg_set_clear_value_1663cbe7da00e7e4(arg0, arg1) {
    arg0.clearValue = arg1;
}
export function __wbg_set_code_3bb44fc02aa17153(arg0, arg1, arg2) {
    arg0.code = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_color_attachments_b740d060dacde5c0(arg0, arg1) {
    arg0.colorAttachments = arg1;
}
export function __wbg_set_color_d0208d092af4f2e6(arg0, arg1) {
    arg0.color = arg1;
}
export function __wbg_set_compare_00dc33383c873ad5(arg0, arg1) {
    arg0.compare = __wbindgen_enum_GpuCompareFunction[arg1];
}
export function __wbg_set_compare_11834994f7d75687(arg0, arg1) {
    arg0.compare = __wbindgen_enum_GpuCompareFunction[arg1];
}
export function __wbg_set_count_ab42cbc78635ed91(arg0, arg1) {
    arg0.count = arg1 >>> 0;
}
export function __wbg_set_cull_mode_c4f1ef740bd14c40(arg0, arg1) {
    arg0.cullMode = __wbindgen_enum_GpuCullMode[arg1];
}
export function __wbg_set_depth_bias_clamp_f573c2dda55692a6(arg0, arg1) {
    arg0.depthBiasClamp = arg1;
}
export function __wbg_set_depth_bias_ebe05aecbb98e11f(arg0, arg1) {
    arg0.depthBias = arg1;
}
export function __wbg_set_depth_bias_slope_scale_27c8208740c46086(arg0, arg1) {
    arg0.depthBiasSlopeScale = arg1;
}
export function __wbg_set_depth_clear_value_57c2283d39fbb181(arg0, arg1) {
    arg0.depthClearValue = arg1;
}
export function __wbg_set_depth_compare_a9c538cec0e01535(arg0, arg1) {
    arg0.depthCompare = __wbindgen_enum_GpuCompareFunction[arg1];
}
export function __wbg_set_depth_fail_op_42b9d46a7c67baae(arg0, arg1) {
    arg0.depthFailOp = __wbindgen_enum_GpuStencilOperation[arg1];
}
export function __wbg_set_depth_load_op_f95fdb158b819261(arg0, arg1) {
    arg0.depthLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
}
export function __wbg_set_depth_or_array_layers_7335d3fc04cd5ade(arg0, arg1) {
    arg0.depthOrArrayLayers = arg1 >>> 0;
}
export function __wbg_set_depth_read_only_878b741b02a4dd71(arg0, arg1) {
    arg0.depthReadOnly = arg1 !== 0;
}
export function __wbg_set_depth_stencil_1c7bed669574dd1e(arg0, arg1) {
    arg0.depthStencil = arg1;
}
export function __wbg_set_depth_stencil_attachment_82ce8924f4e0e79b(arg0, arg1) {
    arg0.depthStencilAttachment = arg1;
}
export function __wbg_set_depth_store_op_4c56ab1d005c7bf6(arg0, arg1) {
    arg0.depthStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
}
export function __wbg_set_depth_write_enabled_f726d4f27a24ff7e(arg0, arg1) {
    arg0.depthWriteEnabled = arg1 !== 0;
}
export function __wbg_set_device_f991f8a955db69f7(arg0, arg1) {
    arg0.device = arg1;
}
export function __wbg_set_dimension_7ca3d24380d365e4(arg0, arg1) {
    arg0.dimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
}
export function __wbg_set_dimension_87dd70a08e54ea98(arg0, arg1) {
    arg0.dimension = __wbindgen_enum_GpuTextureDimension[arg1];
}
export function __wbg_set_dst_factor_1382684d97e2aec4(arg0, arg1) {
    arg0.dstFactor = __wbindgen_enum_GpuBlendFactor[arg1];
}
export function __wbg_set_end_of_pass_write_index_3476a9a4411846af(arg0, arg1) {
    arg0.endOfPassWriteIndex = arg1 >>> 0;
}
export function __wbg_set_entries_44ee8dc60918063d(arg0, arg1) {
    arg0.entries = arg1;
}
export function __wbg_set_entries_803b89386febf57c(arg0, arg1) {
    arg0.entries = arg1;
}
export function __wbg_set_entry_point_418e5aecbf7f95b4(arg0, arg1, arg2) {
    arg0.entryPoint = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_entry_point_ac45ddee35909233(arg0, arg1, arg2) {
    arg0.entryPoint = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_external_texture_73d5e5303574a1e8(arg0, arg1) {
    arg0.externalTexture = arg1;
}
export function __wbg_set_fail_op_6f4612035f584d02(arg0, arg1) {
    arg0.failOp = __wbindgen_enum_GpuStencilOperation[arg1];
}
export function __wbg_set_flip_y_21c0cdab245f4d89(arg0, arg1) {
    arg0.flipY = arg1 !== 0;
}
export function __wbg_set_format_2bd90cb220cc6884(arg0, arg1) {
    arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
}
export function __wbg_set_format_3cc5d6ead9a8cce0(arg0, arg1) {
    arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
}
export function __wbg_set_format_40d793124494a9df(arg0, arg1) {
    arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
}
export function __wbg_set_format_723d6bb38a9e71d3(arg0, arg1) {
    arg0.format = __wbindgen_enum_GpuVertexFormat[arg1];
}
export function __wbg_set_format_c23f7c142762c3a7(arg0, arg1) {
    arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
}
export function __wbg_set_format_e0af83ab86ee58dc(arg0, arg1) {
    arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
}
export function __wbg_set_format_fcbaa54d6b5c186a(arg0, arg1) {
    arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
}
export function __wbg_set_fragment_9b5673b1b740fe0e(arg0, arg1) {
    arg0.fragment = arg1;
}
export function __wbg_set_front_face_bb590812353fd2e0(arg0, arg1) {
    arg0.frontFace = __wbindgen_enum_GpuFrontFace[arg1];
}
export function __wbg_set_g_aa23517844bd7f61(arg0, arg1) {
    arg0.g = arg1;
}
export function __wbg_set_has_dynamic_offset_ea1fb6bd94b0c904(arg0, arg1) {
    arg0.hasDynamicOffset = arg1 !== 0;
}
export function __wbg_set_height_2a52d80e749439c5(arg0, arg1) {
    arg0.height = arg1 >>> 0;
}
export function __wbg_set_height_66583e77881d3a51(arg0, arg1) {
    arg0.height = arg1 >>> 0;
}
export function __wbg_set_height_9a5b963336a79877(arg0, arg1) {
    arg0.height = arg1 >>> 0;
}
export function __wbg_set_label_08e9f27a97fdc9f7(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_0e9f90ea4e961823(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_280bd57b618e4cf6(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_34d2766c2203f76a(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_4bf9f5458cdc0a68(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_797345a8c9c86146(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_8fdd5f28eea3ca08(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_a4be4acc3510c62f(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_bb92451e0d92abf4(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_c3405868bd8f6ab5(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_d73358f96a62d3bc(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_f00eb249a34df7db(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_label_f571593aaa82f18b(arg0, arg1, arg2) {
    arg0.label = getStringFromWasm0(arg1, arg2);
}
export function __wbg_set_layout_9590b02a1d72ac45(arg0, arg1) {
    arg0.layout = arg1;
}
export function __wbg_set_layout_a065a939d1d05a2d(arg0, arg1) {
    arg0.layout = arg1;
}
export function __wbg_set_load_op_07c59d4ab60a3a01(arg0, arg1) {
    arg0.loadOp = __wbindgen_enum_GpuLoadOp[arg1];
}
export function __wbg_set_lod_max_clamp_fd1548dc78538913(arg0, arg1) {
    arg0.lodMaxClamp = arg1;
}
export function __wbg_set_lod_min_clamp_b489016289e378d2(arg0, arg1) {
    arg0.lodMinClamp = arg1;
}
export function __wbg_set_mag_filter_b4e8d7f2fa665d2e(arg0, arg1) {
    arg0.magFilter = __wbindgen_enum_GpuFilterMode[arg1];
}
export function __wbg_set_mapped_at_creation_c78869832c67816c(arg0, arg1) {
    arg0.mappedAtCreation = arg1 !== 0;
}
export function __wbg_set_mask_cee9de29cbe61459(arg0, arg1) {
    arg0.mask = arg1 >>> 0;
}
export function __wbg_set_max_anisotropy_a019fd38d9ba634e(arg0, arg1) {
    arg0.maxAnisotropy = arg1;
}
export function __wbg_set_min_binding_size_26f877007450686c(arg0, arg1) {
    arg0.minBindingSize = arg1;
}
export function __wbg_set_min_filter_cd8cf3dcdeebaa5b(arg0, arg1) {
    arg0.minFilter = __wbindgen_enum_GpuFilterMode[arg1];
}
export function __wbg_set_mip_level_count_1993f039035d2469(arg0, arg1) {
    arg0.mipLevelCount = arg1 >>> 0;
}
export function __wbg_set_mip_level_count_9a86e098393fe360(arg0, arg1) {
    arg0.mipLevelCount = arg1 >>> 0;
}
export function __wbg_set_mip_level_e61d3964c419f64b(arg0, arg1) {
    arg0.mipLevel = arg1 >>> 0;
}
export function __wbg_set_mipmap_filter_a436d61249cfa785(arg0, arg1) {
    arg0.mipmapFilter = __wbindgen_enum_GpuMipmapFilterMode[arg1];
}
export function __wbg_set_module_951f2b6e5477a260(arg0, arg1) {
    arg0.module = arg1;
}
export function __wbg_set_module_a7b3448454ca8879(arg0, arg1) {
    arg0.module = arg1;
}
export function __wbg_set_multisample_bb6537e862d91237(arg0, arg1) {
    arg0.multisample = arg1;
}
export function __wbg_set_multisampled_9642e942e4d9d3ee(arg0, arg1) {
    arg0.multisampled = arg1 !== 0;
}
export function __wbg_set_offset_3e55dd16ffd7aac5(arg0, arg1) {
    arg0.offset = arg1;
}
export function __wbg_set_offset_debfe602a5fbf272(arg0, arg1) {
    arg0.offset = arg1;
}
export function __wbg_set_operation_74a529d361734388(arg0, arg1) {
    arg0.operation = __wbindgen_enum_GpuBlendOperation[arg1];
}
export function __wbg_set_origin_42cf0cf261f50d63(arg0, arg1) {
    arg0.origin = arg1;
}
export function __wbg_set_origin_f7a8894367b28556(arg0, arg1) {
    arg0.origin = arg1;
}
export function __wbg_set_pass_op_8abd39478c76666a(arg0, arg1) {
    arg0.passOp = __wbindgen_enum_GpuStencilOperation[arg1];
}
export function __wbg_set_power_preference_b8b4ea5da6674cf7(arg0, arg1) {
    arg0.powerPreference = __wbindgen_enum_GpuPowerPreference[arg1];
}
export function __wbg_set_premultiplied_alpha_dde44b27abcf88fc(arg0, arg1) {
    arg0.premultipliedAlpha = arg1 !== 0;
}
export function __wbg_set_primitive_f189fcdcb22d09e0(arg0, arg1) {
    arg0.primitive = arg1;
}
export function __wbg_set_query_set_dcf406a51ece8f85(arg0, arg1) {
    arg0.querySet = arg1;
}
export function __wbg_set_r_8961014434a7656e(arg0, arg1) {
    arg0.r = arg1;
}
export function __wbg_set_required_features_ec67124fd26c4d29(arg0, arg1) {
    arg0.requiredFeatures = arg1;
}
export function __wbg_set_required_limits_c9ee7006f1d1f2ab(arg0, arg1) {
    arg0.requiredLimits = arg1;
}
export function __wbg_set_resolve_target_cc7a6f0d2973ea34(arg0, arg1) {
    arg0.resolveTarget = arg1;
}
export function __wbg_set_resource_86645e7515651c0e(arg0, arg1) {
    arg0.resource = arg1;
}
export function __wbg_set_sample_count_4d7160817d98838f(arg0, arg1) {
    arg0.sampleCount = arg1 >>> 0;
}
export function __wbg_set_sample_type_8d4d5b141ce0f724(arg0, arg1) {
    arg0.sampleType = __wbindgen_enum_GpuTextureSampleType[arg1];
}
export function __wbg_set_sampler_35bcbac78bd4356f(arg0, arg1) {
    arg0.sampler = arg1;
}
export function __wbg_set_shader_location_3ce5152f6d464a63(arg0, arg1) {
    arg0.shaderLocation = arg1 >>> 0;
}
export function __wbg_set_size_81a77f7f4f34fbed(arg0, arg1) {
    arg0.size = arg1;
}
export function __wbg_set_size_85cb1c2c4c3ea73a(arg0, arg1) {
    arg0.size = arg1;
}
export function __wbg_set_size_981550e5d7941340(arg0, arg1) {
    arg0.size = arg1;
}
export function __wbg_set_source_51577a2cebeadf81(arg0, arg1) {
    arg0.source = arg1;
}
export function __wbg_set_src_factor_9a8e0943a05c9174(arg0, arg1) {
    arg0.srcFactor = __wbindgen_enum_GpuBlendFactor[arg1];
}
export function __wbg_set_stencil_back_596ea9628419413d(arg0, arg1) {
    arg0.stencilBack = arg1;
}
export function __wbg_set_stencil_clear_value_15afeb03c22cd51d(arg0, arg1) {
    arg0.stencilClearValue = arg1 >>> 0;
}
export function __wbg_set_stencil_front_31be994e05be5aaa(arg0, arg1) {
    arg0.stencilFront = arg1;
}
export function __wbg_set_stencil_load_op_1cd94e9e8c54f611(arg0, arg1) {
    arg0.stencilLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
}
export function __wbg_set_stencil_read_mask_1635f30a0e6539e3(arg0, arg1) {
    arg0.stencilReadMask = arg1 >>> 0;
}
export function __wbg_set_stencil_read_only_f071431988182ad8(arg0, arg1) {
    arg0.stencilReadOnly = arg1 !== 0;
}
export function __wbg_set_stencil_store_op_a244d5347f386c8c(arg0, arg1) {
    arg0.stencilStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
}
export function __wbg_set_stencil_write_mask_7809f82a1debe58f(arg0, arg1) {
    arg0.stencilWriteMask = arg1 >>> 0;
}
export function __wbg_set_step_mode_eb762c8c4264418f(arg0, arg1) {
    arg0.stepMode = __wbindgen_enum_GpuVertexStepMode[arg1];
}
export function __wbg_set_storage_texture_22f78b5171d1195a(arg0, arg1) {
    arg0.storageTexture = arg1;
}
export function __wbg_set_store_op_386596acc7bf2c16(arg0, arg1) {
    arg0.storeOp = __wbindgen_enum_GpuStoreOp[arg1];
}
export function __wbg_set_strip_index_format_e76748cd840ab562(arg0, arg1) {
    arg0.stripIndexFormat = __wbindgen_enum_GpuIndexFormat[arg1];
}
export function __wbg_set_targets_22473476afe0dabd(arg0, arg1) {
    arg0.targets = arg1;
}
export function __wbg_set_texture_ac9a46252c0cb532(arg0, arg1) {
    arg0.texture = arg1;
}
export function __wbg_set_texture_aeea930400349204(arg0, arg1) {
    arg0.texture = arg1;
}
export function __wbg_set_timestamp_writes_0236dfc7ae2b1a03(arg0, arg1) {
    arg0.timestampWrites = arg1;
}
export function __wbg_set_topology_e18a15a717ebc912(arg0, arg1) {
    arg0.topology = __wbindgen_enum_GpuPrimitiveTopology[arg1];
}
export function __wbg_set_type_31b1662dd5a6144d(arg0, arg1) {
    arg0.type = __wbindgen_enum_GpuSamplerBindingType[arg1];
}
export function __wbg_set_type_719f40cf36d314f1(arg0, arg1) {
    arg0.type = __wbindgen_enum_GpuBufferBindingType[arg1];
}
export function __wbg_set_unclipped_depth_0f5d142d317e3a7c(arg0, arg1) {
    arg0.unclippedDepth = arg1 !== 0;
}
export function __wbg_set_usage_26861a639595cd45(arg0, arg1) {
    arg0.usage = arg1 >>> 0;
}
export function __wbg_set_usage_7b79a227ada2f5cc(arg0, arg1) {
    arg0.usage = arg1 >>> 0;
}
export function __wbg_set_usage_d9ff4b7757fac246(arg0, arg1) {
    arg0.usage = arg1 >>> 0;
}
export function __wbg_set_usage_e8d45decd5c483b3(arg0, arg1) {
    arg0.usage = arg1 >>> 0;
}
export function __wbg_set_vertex_b95705590b782671(arg0, arg1) {
    arg0.vertex = arg1;
}
export function __wbg_set_view_6ff951d6e3f9e337(arg0, arg1) {
    arg0.view = arg1;
}
export function __wbg_set_view_cf298e1e7b6ef38a(arg0, arg1) {
    arg0.view = arg1;
}
export function __wbg_set_view_dimension_87c95b0d987a14cd(arg0, arg1) {
    arg0.viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
}
export function __wbg_set_view_dimension_e99ec138da7b8f83(arg0, arg1) {
    arg0.viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
}
export function __wbg_set_view_formats_733fb624c2f2ef6b(arg0, arg1) {
    arg0.viewFormats = arg1;
}
export function __wbg_set_view_formats_c2b27891ca5d2740(arg0, arg1) {
    arg0.viewFormats = arg1;
}
export function __wbg_set_visibility_315bcac6427d0ba0(arg0, arg1) {
    arg0.visibility = arg1 >>> 0;
}
export function __wbg_set_width_63034f88f9905ea3(arg0, arg1) {
    arg0.width = arg1 >>> 0;
}
export function __wbg_set_width_913f2db354db9600(arg0, arg1) {
    arg0.width = arg1 >>> 0;
}
export function __wbg_set_width_d8263652df911d1d(arg0, arg1) {
    arg0.width = arg1 >>> 0;
}
export function __wbg_set_write_mask_0b6ca0cb1b797997(arg0, arg1) {
    arg0.writeMask = arg1 >>> 0;
}
export function __wbg_set_x_0b48c73e72f71653(arg0, arg1) {
    arg0.x = arg1 >>> 0;
}
export function __wbg_set_x_ffcb360b171098d5(arg0, arg1) {
    arg0.x = arg1 >>> 0;
}
export function __wbg_set_y_046a6a6e9b0ccbc6(arg0, arg1) {
    arg0.y = arg1 >>> 0;
}
export function __wbg_set_y_db82e366feb18537(arg0, arg1) {
    arg0.y = arg1 >>> 0;
}
export function __wbg_set_z_cec02b76fd208d0e(arg0, arg1) {
    arg0.z = arg1 >>> 0;
}
export function __wbg_static_accessor_GLOBAL_44bef9fa6011e260() {
    const ret = typeof global === 'undefined' ? null : global;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}
export function __wbg_static_accessor_GLOBAL_THIS_13002645baf43d84() {
    const ret = typeof globalThis === 'undefined' ? null : globalThis;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}
export function __wbg_static_accessor_SELF_91d0abd4d035416c() {
    const ret = typeof self === 'undefined' ? null : self;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}
export function __wbg_static_accessor_WINDOW_513f857c65724fc7() {
    const ret = typeof window === 'undefined' ? null : window;
    return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
}
export function __wbg_submit_f39583470d95df20(arg0, arg1) {
    arg0.submit(arg1);
}
export function __wbg_then_34956fdd88b794f7(arg0, arg1, arg2) {
    const ret = arg0.then(arg1, arg2);
    return ret;
}
export function __wbg_then_d9ebfadd74ddfbb2(arg0, arg1) {
    const ret = arg0.then(arg1);
    return ret;
}
export function __wbg_then_f6dedb0d880db23a(arg0, arg1, arg2) {
    const ret = arg0.then(arg1, arg2);
    return ret;
}
export function __wbg_unmap_9455a68932e9b935(arg0) {
    arg0.unmap();
}
export function __wbg_value_8996dd08e99f9529(arg0) {
    const ret = arg0.value;
    return ret;
}
export function __wbindgen_cast_0000000000000001(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 121, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__he232159dac672442);
    return ret;
}
export function __wbindgen_cast_0000000000000002(arg0, arg1) {
    // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 93, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
    const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h31621db3e5ffa71d);
    return ret;
}
export function __wbindgen_cast_0000000000000003(arg0) {
    // Cast intrinsic for `F64 -> Externref`.
    const ret = arg0;
    return ret;
}
export function __wbindgen_cast_0000000000000004(arg0) {
    // Cast intrinsic for `I64 -> Externref`.
    const ret = arg0;
    return ret;
}
export function __wbindgen_cast_0000000000000005(arg0, arg1) {
    // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
    const ret = getArrayU8FromWasm0(arg0, arg1);
    return ret;
}
export function __wbindgen_cast_0000000000000006(arg0, arg1) {
    // Cast intrinsic for `Ref(String) -> Externref`.
    const ret = getStringFromWasm0(arg0, arg1);
    return ret;
}
export function __wbindgen_init_externref_table() {
    const table = wasm.__wbindgen_externrefs;
    const offset = table.grow(4);
    table.set(0, undefined);
    table.set(offset + 0, undefined);
    table.set(offset + 1, null);
    table.set(offset + 2, true);
    table.set(offset + 3, false);
}
function wasm_bindgen__convert__closures_____invoke__h31621db3e5ffa71d(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures_____invoke__h31621db3e5ffa71d(arg0, arg1, arg2);
}

function wasm_bindgen__convert__closures_____invoke__he232159dac672442(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__he232159dac672442(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen__convert__closures_____invoke__h41b114d20b0b0163(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__h41b114d20b0b0163(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_GpuAddressMode = ["clamp-to-edge", "repeat", "mirror-repeat"];


const __wbindgen_enum_GpuBlendFactor = ["zero", "one", "src", "one-minus-src", "src-alpha", "one-minus-src-alpha", "dst", "one-minus-dst", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant", "src1", "one-minus-src1", "src1-alpha", "one-minus-src1-alpha"];


const __wbindgen_enum_GpuBlendOperation = ["add", "subtract", "reverse-subtract", "min", "max"];


const __wbindgen_enum_GpuBufferBindingType = ["uniform", "storage", "read-only-storage"];


const __wbindgen_enum_GpuCanvasAlphaMode = ["opaque", "premultiplied"];


const __wbindgen_enum_GpuCompareFunction = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"];


const __wbindgen_enum_GpuCullMode = ["none", "front", "back"];


const __wbindgen_enum_GpuFilterMode = ["nearest", "linear"];


const __wbindgen_enum_GpuFrontFace = ["ccw", "cw"];


const __wbindgen_enum_GpuIndexFormat = ["uint16", "uint32"];


const __wbindgen_enum_GpuLoadOp = ["load", "clear"];


const __wbindgen_enum_GpuMipmapFilterMode = ["nearest", "linear"];


const __wbindgen_enum_GpuPowerPreference = ["low-power", "high-performance"];


const __wbindgen_enum_GpuPrimitiveTopology = ["point-list", "line-list", "line-strip", "triangle-list", "triangle-strip"];


const __wbindgen_enum_GpuSamplerBindingType = ["filtering", "non-filtering", "comparison"];


const __wbindgen_enum_GpuStencilOperation = ["keep", "zero", "replace", "invert", "increment-clamp", "decrement-clamp", "increment-wrap", "decrement-wrap"];


const __wbindgen_enum_GpuStorageTextureAccess = ["write-only", "read-only", "read-write"];


const __wbindgen_enum_GpuStoreOp = ["store", "discard"];


const __wbindgen_enum_GpuTextureAspect = ["all", "stencil-only", "depth-only"];


const __wbindgen_enum_GpuTextureDimension = ["1d", "2d", "3d"];


const __wbindgen_enum_GpuTextureFormat = ["r8unorm", "r8snorm", "r8uint", "r8sint", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint", "r32float", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16uint", "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb"];


const __wbindgen_enum_GpuTextureSampleType = ["float", "unfilterable-float", "depth", "sint", "uint"];


const __wbindgen_enum_GpuTextureViewDimension = ["1d", "2d", "2d-array", "cube", "cube-array", "3d"];


const __wbindgen_enum_GpuVertexFormat = ["uint8", "uint8x2", "uint8x4", "sint8", "sint8x2", "sint8x4", "unorm8", "unorm8x2", "unorm8x4", "snorm8", "snorm8x2", "snorm8x4", "uint16", "uint16x2", "uint16x4", "sint16", "sint16x2", "sint16x4", "unorm16", "unorm16x2", "unorm16x4", "snorm16", "snorm16x2", "snorm16x4", "float16", "float16x2", "float16x4", "float32", "float32x2", "float32x3", "float32x4", "uint32", "uint32x2", "uint32x3", "uint32x4", "sint32", "sint32x2", "sint32x3", "sint32x4", "unorm10-10-10-2", "unorm8x4-bgra"];


const __wbindgen_enum_GpuVertexStepMode = ["vertex", "instance"];

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;


let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}
