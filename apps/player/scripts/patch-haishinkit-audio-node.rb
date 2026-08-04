# frozen_string_literal: true

# Backports HaishinKit commit f5ca8e029d2c89138a0117baa96de17ed18646fb
# to the pinned 1.9.9 CocoaPod. The upstream fix avoids passing a stored
# property by inout before super.init, which crashes optimized Swift builds on
# current Xcode releases.
module DunaHaishinKitAudioNodePatch
  AUDIO_NODE_PATH = File.join(
    "HaishinKit",
    "Sources",
    "IO",
    "AudioNode.swift"
  ).freeze

  MIXER_ORIGINAL = [
    "    init(format: AVAudioFormat) throws {",
    "        try super.init(description: &mixerComponentDescription)",
    "    }"
  ].join("\n").freeze

  MIXER_PATCHED = [
    "    init(format: AVAudioFormat) throws {",
    "        var mixerDefaultDesc = AudioComponentDescription(",
    "            componentType: kAudioUnitType_Mixer,",
    "            componentSubType: kAudioUnitSubType_MultiChannelMixer,",
    "            componentManufacturer: kAudioUnitManufacturer_Apple,",
    "            componentFlags: 0,",
    "            componentFlagsMask: 0)",
    "",
    "        try super.init(description: &mixerDefaultDesc)",
    "",
    "        self.mixerComponentDescription = mixerDefaultDesc",
    "    }"
  ].join("\n").freeze

  OUTPUT_ORIGINAL = [
    "        self.buffer = buffer",
    "        try super.init(description: &outputComponentDescription)"
  ].join("\n").freeze

  OUTPUT_PATCHED = [
    "        self.buffer = buffer",
    "",
    "        var outputDefaultDesc = AudioComponentDescription(",
    "            componentType: kAudioUnitType_Output,",
    "            componentSubType: kAudioUnitSubType_GenericOutput,",
    "            componentManufacturer: kAudioUnitManufacturer_Apple,",
    "            componentFlags: 0,",
    "            componentFlagsMask: 0)",
    "",
    "        try super.init(description: &outputDefaultDesc)",
    "",
    "        self.outputComponentDescription = outputDefaultDesc"
  ].join("\n").freeze

  def self.apply!(pods_root)
    audio_node_path = File.join(pods_root, AUDIO_NODE_PATH)
    unless File.file?(audio_node_path)
      raise "Duna could not locate HaishinKit AudioNode.swift at #{audio_node_path}."
    end

    source = File.read(audio_node_path)
    patched_source = replace_exact!(
      source,
      MIXER_ORIGINAL,
      MIXER_PATCHED,
      "MixerNode"
    )
    patched_source = replace_exact!(
      patched_source,
      OUTPUT_ORIGINAL,
      OUTPUT_PATCHED,
      "OutputNode"
    )

    return if patched_source == source

    original_mode = File.stat(audio_node_path).mode
    File.chmod(original_mode | 0o200, audio_node_path)
    File.write(audio_node_path, patched_source)
  ensure
    File.chmod(original_mode, audio_node_path) if original_mode
  end

  def self.replace_exact!(source, original, patched, node_name)
    return source if source.include?(patched)

    unless source.include?(original)
      raise(
        "Duna's HaishinKit #{node_name} patch no longer matches the installed " \
        "source. Review the pinned dependency before building."
      )
    end

    source.sub(original, patched)
  end
  private_class_method :replace_exact!
end
