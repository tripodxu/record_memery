"""一键安装语音识别环境

运行方式: python setup_voice.py
"""
import subprocess
import sys
import os


def check_ffmpeg():
    """检查 ffmpeg 是否安装"""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            version = result.stdout.split("\n")[0]
            print(f"  [OK] ffmpeg: {version}")
            return True
    except FileNotFoundError:
        pass
    except Exception:
        pass

    print("  [缺失] ffmpeg 未安装")
    print("         安装方法:")
    print("         Windows: winget install ffmpeg")
    print("         或从 https://ffmpeg.org/download.html 下载")
    print("         安装后需要重启终端")
    return False


def check_vosk():
    """检查 vosk 是否安装"""
    try:
        import vosk
        version = getattr(vosk, "__version__", "已安装")
        print(f"  [OK] vosk {version}")
        return True
    except ImportError:
        print("  [缺失] vosk 未安装")
        return False


def install_vosk():
    """安装 vosk"""
    print("\n[2/3] 安装 vosk...")
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "vosk", "--break-system-packages"],
        capture_output=False,
    )
    return result.returncode == 0


def download_model():
    """下载中文语音模型"""
    print("\n[3/3] 下载中文语音模型 (vosk-model-small-cn-0.22, 约 50MB)...")
    try:
        from app.services.vosk_service import download_model as dl, is_model_ready
        if is_model_ready():
            print("  [OK] 模型已存在，跳过下载")
            return True
        result = dl()
        print(f"  {result}")
        return is_model_ready()
    except Exception as e:
        print(f"  [错误] {e}")
        return False


def main():
    print("=" * 50)
    print("  Memory Shards - 语音识别环境安装")
    print("=" * 50)

    # 1. 检查 ffmpeg
    print("\n[1/3] 检查 ffmpeg...")
    ffmpeg_ok = check_ffmpeg()

    # 2. 检查/安装 vosk
    print("\n[2/3] 检查 vosk...")
    vosk_ok = check_vosk()
    if not vosk_ok:
        print("  正在安装...")
        vosk_ok = install_vosk()
        if vosk_ok:
            print("  [OK] vosk 安装成功")
        else:
            print("  [错误] vosk 安装失败")

    # 3. 下载模型
    model_ok = False
    if vosk_ok:
        model_ok = download_model()

    # 总结
    print("\n" + "=" * 50)
    print("  安装结果:")
    print(f"    ffmpeg:  {'✓' if ffmpeg_ok else '✗'}")
    print(f"    vosk:    {'✓' if vosk_ok else '✗'}")
    print(f"    模型:    {'✓' if model_ok else '✗'}")

    if ffmpeg_ok and vosk_ok and model_ok:
        print("\n  语音识别环境就绪！可以正常使用语音转写功能。")
    else:
        print("\n  部分组件缺失，语音录音仍可保存，但转写功能不可用。")
        print("  请按上述提示安装缺失组件后重新运行此脚本。")

    print("=" * 50)


if __name__ == "__main__":
    # 切换到脚本所在目录
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
