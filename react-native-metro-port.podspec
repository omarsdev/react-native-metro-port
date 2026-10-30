require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = package['name']
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = package['homepage']
  s.license      = package['license']
  s.author       = package['author']
  s.platforms    = { :ios => defined?(min_ios_version_supported) ? min_ios_version_supported : '15.1' }
  s.source       = { :git => 'https://github.com/omarsdev/react-native-metro-port.git', :tag => "v#{s.version}" }

  s.source_files   = 'ios/**/*.m'
  s.preserve_paths = 'scripts/*.sh'

  # Decides the port on the Mac at build time. Always out of date because Metro's
  # port can change without any source file changing; the header it writes is only
  # touched when the port differs, so an unchanged port recompiles nothing.
  s.script_phase = {
    :name => '[react-native-metro-port] Resolve Metro port',
    :script => 'bash "${PODS_TARGET_SRCROOT}/scripts/resolve-metro-port.sh"',
    :execution_position => :before_compile,
    :output_files => ['${DERIVED_FILE_DIR}/RNMetroPortConfig.h'],
    :always_out_of_date => '1',
  }

  if defined?(install_modules_dependencies)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'
  end
end
