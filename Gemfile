source "https://rubygems.org"

gem "fastlane"
gem "xcodeproj"
# CocoaPods drives the iOS dependency install after `expo prebuild` generates
# the native project. Pinned here so CI doesn't depend on the runner's
# preinstalled CocoaPods.
gem "cocoapods"

# Transitive deps fastlane's runtime requires but doesn't list explicitly.
# Without these, bundler in frozen mode raises:
#   "<gem> is not part of the bundle. Add it to your Gemfile."
gem "multi_json"   # representable -> google-apis-core loader chain
gem "rexml"        # extracted from Ruby default gems in 3.3+
gem "json"
