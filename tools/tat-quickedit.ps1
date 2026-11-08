# Tat QuickEdit cua cua so den dang chay game (server.js goi luc khoi dong).
# QuickEdit bat thi chi can bam chuot vao cua so la Windows dung in chu -> console.log cua server bi chan ->
# ca game dung, TikTok khong nhan duoc ping nen ngat ket noi. Chi doi cua so hien tai, khong sua cai dat Windows.
$sig = @'
[DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
public static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint mode);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint mode);
[DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
'@
$k = Add-Type -MemberDefinition $sig -Name Con -Namespace LiveBar -PassThru
# CONIN$: bo dem nhap cua cua so den (doc + ghi, chia se doc + ghi, OPEN_EXISTING)
$h = $k::CreateFile('CONIN$', [uint32]3221225472, 3, [IntPtr]::Zero, 3, 0, [IntPtr]::Zero)
if ($h -eq [IntPtr]::new(-1)) { exit 1 }
$m = 0
if ($k::GetConsoleMode($h, [ref]$m)) {
  # bo ENABLE_QUICK_EDIT_MODE (0x40), giu ENABLE_EXTENDED_FLAGS (0x80) de Windows nhan thay doi
  [void]$k::SetConsoleMode($h, ($m -band (-bnot 0x40)) -bor 0x80)
  exit 0
}
[void]$k::CloseHandle($h)
exit 2
